import { and, eq, gt } from "drizzle-orm";
import type { AuditAction, AuditDetails } from "@contracts/audit";
import { auditLog } from "../../db/schema";
import { getDb } from "../queries/connection";

type Db = ReturnType<typeof getDb>;
/** The database, or a transaction on it (so the entry is saved only if the action is). */
type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

type Entry = {
  actorId: number;
  action: AuditAction;
  targetUserId?: number | null;
  applicationId?: number | null;
  details?: AuditDetails;
};

/** Adds one line to the audit trail (Admin → Activity → Staff actions). */
export async function audit(entry: Entry, db: DbOrTx = getDb()) {
  await db.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    targetUserId: entry.targetUserId ?? null,
    applicationId: entry.applicationId ?? null,
    details: entry.details ?? null,
  });
}

/** Opening the same documents again within this time is the same visit: one line, not one per reload. */
const SAME_VISIT_MS = 10 * 60_000;

/** Records that a staff member opened an applicant's documents (once per visit). */
export async function auditDocumentsViewed(actorId: number, applicationId: number) {
  const db = getDb();
  const recent = await db.query.auditLog.findFirst({
    columns: { id: true },
    where: and(
      eq(auditLog.actorId, actorId),
      eq(auditLog.applicationId, applicationId),
      eq(auditLog.action, "documents_viewed"),
      gt(auditLog.createdAt, new Date(Date.now() - SAME_VISIT_MS)),
    ),
  });
  if (!recent) await audit({ actorId, action: "documents_viewed", applicationId }, db);
}
