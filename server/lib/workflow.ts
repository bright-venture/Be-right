import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { requestEvents, serviceRequests, type ServiceRequest } from "@db/schema";
import { canTransition, TRANSITIONS, type TransitionName } from "@contracts/workflow";
import type { RequestStatus } from "@contracts/services";
import { getDb } from "../queries/connection";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type RequestPatch = Partial<typeof serviceRequests.$inferInsert>;

/** Restricts a lookup to requests the caller may act on. */
/** Whose requests: a customer's, a technician's, a specialist's services, or (admins) any. */
export type RequestScope = { customerId: number } | { technicianId: number } | { categories: string[] } | "any";

export function scopeFilter(scope: RequestScope): SQL | undefined {
  if (scope === "any") return undefined;
  if ("customerId" in scope) return eq(serviceRequests.userId, scope.customerId);
  if ("categories" in scope) return scope.categories.length ? inArray(serviceRequests.category, scope.categories) : sql`false`;
  return eq(serviceRequests.technicianId, scope.technicianId);
}

/** Loads a request (row-locked inside a transaction) or throws NOT_FOUND. */
export async function findRequest(db: Db | Tx, id: number, scope: RequestScope, lock = false) {
  const query = db
    .select()
    .from(serviceRequests)
    .where(and(eq(serviceRequests.id, id), scopeFilter(scope)))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
  return row;
}

export async function logEvent(
  db: Db | Tx,
  requestId: number,
  status: string,
  actorId: number,
  note?: string | null,
) {
  await db.insert(requestEvents).values({ requestId, status, actorId, note: note ?? null });
}

/**
 * Moves a request through one step of its life cycle (see contracts/workflow.ts).
 * The row is locked, the current status re-checked, the change applied and the
 * timeline event written in a single transaction, so concurrent clicks can't race.
 */
export async function applyTransition(opts: {
  id: number;
  name: TransitionName;
  actorId: number;
  scope: RequestScope;
  note?: string | null;
  patch?: RequestPatch;
  /** Extra precondition; return an error message to refuse. */
  guard?: (row: ServiceRequest) => string | null;
}): Promise<ServiceRequest> {
  const step = TRANSITIONS[opts.name];
  return getDb().transaction(async (tx) => {
    const row = await findRequest(tx, opts.id, opts.scope, true);
    if (!canTransition(opts.name, row.status as RequestStatus)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Cannot ${opts.name} a request that is ${row.status.replace("_", " ")}`,
      });
    }
    const refusal = opts.guard?.(row);
    if (refusal) throw new TRPCError({ code: "BAD_REQUEST", message: refusal });

    const [updated] = await tx
      .update(serviceRequests)
      .set({ ...opts.patch, status: step.to })
      .where(eq(serviceRequests.id, row.id))
      .returning();
    await logEvent(tx, row.id, step.to, opts.actorId, opts.note);
    return updated;
  });
}
