import { z } from "zod";
import { and, desc, eq, gt, ilike, inArray, lt, lte, max, notInArray, or, sql } from "drizzle-orm";
import { createRouter, specialistQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { requestEvents, requestMedia, serviceRequests, technicianLocations, users } from "../db/schema";
import { ACTIVE_JOB_STATUSES } from "@contracts/workflow";
import type { RequestStatus } from "@contracts/services";
import {
  QUOTE_AMOUNT_PATTERN,
  VISIT_FEE_REASON_LABEL,
  VISIT_FEE_REASONS,
} from "@contracts/workflow";
import { applyTransition, findRequest, logEvent } from "./lib/workflow";
import { profilePhotoUrl } from "./lib/storage";
import { ratingFor, reviewOf } from "./queries/ratings";
import { TRPCError } from "@trpc/server";
import { notify } from "./notify";
import { likeTerm, pageInput, PAGE_SIZE } from "./lib/paging";

const byId = z.object({ id: z.number().int() });

// Queue order: open cases first, then oldest first.
const CLOSED: readonly RequestStatus[] = ["completed", "cancelled"];

/** Closed requests stay in the live queue this long; older ones load on demand (`history`). */
const RECENT_CLOSED_DAYS = 30;
const closedCutoff = () => new Date(Date.now() - RECENT_CLOSED_DAYS * 86_400_000);
/** Safety cap on the live queue (open requests are naturally few; this only guards a flood). */
const LIVE_QUEUE_LIMIT = 2000;

export const specialistRouter = createRouter({
  /** Can this session use the staff dashboard? (Refused without a password and two-step login.) */
  access: specialistQuery.query(() => ({ ok: true })),

  /**
   * The live queue: every open request, plus those closed in the last ${RECENT_CLOSED_DAYS} days.
   * Older closed requests come from `history`, a page at a time.
   */
  queue: specialistQuery.query(async () => {
    const rows = await getDb()
      .select({
        request: serviceRequests,
        customerName: users.name,
        customerEmail: users.email,
      })
      .from(serviceRequests)
      .leftJoin(users, eq(serviceRequests.userId, users.id))
      .where(or(notInArray(serviceRequests.status, [...CLOSED]), gt(serviceRequests.updatedAt, closedCutoff())))
      .orderBy(desc(serviceRequests.createdAt))
      .limit(LIVE_QUEUE_LIMIT);
    const rank = (r: (typeof rows)[number]["request"]) => [
      CLOSED.includes(r.status) ? 1 : 0,
      r.createdAt.getTime(),
    ];
    return rows.sort((a, b) => {
      const [x, y] = [rank(a.request), rank(b.request)];
      return x[0] - y[0] || x[1] - y[1];
    });
  }),

  /**
   * Did anything change since the dashboard loaded? It asks every 10 seconds (four numbers,
   * each from an index) and reloads the queue and the open request only when one changes:
   * a request changed or was booked, something was logged on one (a technician arrived),
   * or a photo was added.
   */
  queueVersion: specialistQuery.query(async () => {
    const db = getDb();
    const [[requests], [events], [media]] = await Promise.all([
      db.select({ updatedAt: max(serviceRequests.updatedAt), latestId: max(serviceRequests.id) }).from(serviceRequests),
      db.select({ latestEventId: max(requestEvents.id) }).from(requestEvents),
      db.select({ latestMediaId: max(requestMedia.id) }).from(requestMedia),
    ]);
    return {
      updatedAt: requests?.updatedAt ?? null,
      latestId: requests?.latestId ?? null,
      latestEventId: events?.latestEventId ?? null,
      latestMediaId: media?.latestMediaId ?? null,
    };
  }),

  /** Closed requests older than the live queue, newest first, a page at a time. */
  history: specialistQuery
    .input(
      pageInput.extend({
        status: z.enum(["completed", "cancelled"]).nullish(),
        category: z.string().max(64).nullish(),
        search: z.string().trim().max(100).nullish(),
      }),
    )
    .query(async ({ input }) => {
      const term = input.search?.replace(/^#/, "");
      const rows = await getDb()
        .select({
          request: serviceRequests,
          customerName: users.name,
          customerEmail: users.email,
        })
        .from(serviceRequests)
        .leftJoin(users, eq(serviceRequests.userId, users.id))
        .where(
          and(
            inArray(serviceRequests.status, input.status ? [input.status] : [...CLOSED]),
            lte(serviceRequests.updatedAt, closedCutoff()),
            input.cursor ? lt(serviceRequests.id, input.cursor) : undefined,
            input.category ? eq(serviceRequests.category, input.category) : undefined,
            term
              ? or(
                  /^\d+$/.test(term) ? eq(serviceRequests.id, Number(term)) : sql`false`,
                  ...[users.name, users.email, serviceRequests.phone, serviceRequests.area, serviceRequests.address].map(
                    (column) => ilike(column, likeTerm(term)),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(serviceRequests.id))
        .limit(PAGE_SIZE + 1);
      const items = rows.slice(0, PAGE_SIZE);
      return { items, nextCursor: rows.length > PAGE_SIZE ? items[items.length - 1].request.id : null };
    }),

  detail: specialistQuery.input(byId).query(async ({ input }) => {
    const db = getDb();
    const row = await findRequest(db, input.id, "any");
    const active = ACTIVE_JOB_STATUSES.includes(row.status);
    const [customer, media, events, loc, tech] = await Promise.all([
      row.userId ? db.query.users.findFirst({ where: eq(users.id, row.userId) }) : undefined,
      db.select().from(requestMedia).where(eq(requestMedia.requestId, row.id)),
      db
        .select()
        .from(requestEvents)
        .where(eq(requestEvents.requestId, row.id))
        .orderBy(desc(requestEvents.createdAt)),
      active
        ? db.query.technicianLocations.findFirst({ where: eq(technicianLocations.requestId, row.id) })
        : undefined,
      row.technicianId ? db.query.users.findFirst({ where: eq(users.id, row.technicianId) }) : undefined,
    ]);
    const location = loc ? { lat: loc.lat, lng: loc.lng, updatedAt: loc.updatedAt } : null;
    // Whoever did the job, even if they're no longer a technician.
    const technician = tech
      ? {
          id: tech.id,
          name: tech.name,
          email: tech.email,
          phone: tech.phone,
          photoUrl: await profilePhotoUrl(tech.avatar),
          stillTechnician: tech.role === "technician",
          rating: await ratingFor(tech.id),
        }
      : null;
    // A guarantee visit: which job it's about, and who did it (often the one to send back).
    const original = row.guaranteeFor
      ? await db.query.serviceRequests.findFirst({ where: eq(serviceRequests.id, row.guaranteeFor) })
      : undefined;
    const originalTech = original?.technicianId
      ? await db.query.users.findFirst({ where: eq(users.id, original.technicianId) })
      : undefined;
    const guarantee = original
      ? {
          originalId: original.id,
          technicianId: originalTech?.id ?? null,
          technicianName: originalTech?.name ?? originalTech?.email ?? null,
        }
      : null;
    const review = row.status === "completed" ? await reviewOf(row.id) : null;
    return { request: row, customer, media, events, location, technician, guarantee, review };
  }),

  startReview: specialistQuery
    .input(byId)
    .mutation(async ({ ctx, input }) => {
      await applyTransition({
        id: input.id,
        name: "startReview",
        actorId: ctx.user.id,
        scope: "any",
      });
      return { ok: true };
    }),

  sendQuote: specialistQuery
    .input(
      z.object({
        id: z.number().int(),
        amount: z.string().trim().regex(QUOTE_AMOUNT_PATTERN, "Enter the amount in USD, e.g. 45 or 45.50"),
        note: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await applyTransition({
        id: input.id,
        name: "sendQuote",
        actorId: ctx.user.id,
        scope: "any",
        patch: { quoteAmount: input.amount, quoteNote: input.note ?? null },
        note: `Quote: ${input.amount}${input.note ? `. ${input.note}` : ""}`,
      });
      await notify.quoteSent(input.id);
      return { ok: true };
    }),

  /** Guarantee claim is covered: a free return visit, no price for the customer to approve. */
  acceptGuarantee: specialistQuery.input(byId).mutation(async ({ ctx, input }) => {
    await applyTransition({
      id: input.id,
      name: "acceptGuarantee",
      actorId: ctx.user.id,
      scope: "any",
      patch: { quoteAmount: "0", quoteNote: "Covered by the workmanship guarantee" },
      note: "Free return visit (guarantee)",
      guard: (row) => (row.guaranteeFor ? null : "Only guarantee visits can be free"),
    });
    await notify.guaranteeAccepted(input.id);
    return { ok: true };
  }),

  /** Close an open request (spam, out of area, the customer asked to cancel). */
  cancel: specialistQuery
    .input(z.object({ id: z.number().int(), reason: z.string().trim().min(3).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      await applyTransition({
        id: input.id,
        name: "close",
        actorId: ctx.user.id,
        scope: "any",
        note: input.reason,
      });
      await notify.closedByUs(input.id);
      return { ok: true };
    }),

  /**
   * The technician went but no repair happened (no work needed or declined, nobody there,
   * or the customer cancelled once the technician was on the way): close the job charging
   * only the visit fee fixed at booking. Never on guarantee visits.
   */
  closeWithVisitFee: specialistQuery
    .input(
      z.object({
        id: z.number().int(),
        reason: z.enum(VISIT_FEE_REASONS),
        note: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await applyTransition({
        id: input.id,
        name: "closeWithVisitFee",
        actorId: ctx.user.id,
        scope: "any",
        note: [`Visit fee (${VISIT_FEE_REASON_LABEL[input.reason]})`, input.note].filter(Boolean).join(". "),
        patch: { visitFeeReason: input.reason },
        guard: (row) =>
          row.guaranteeFor
            ? "Guarantee visits are free"
            : !row.visitFee
              ? "This request was booked before visit fees"
              : null,
      });
      await notify.visitFeeCharged(input.id);
      return { ok: true };
    }),

  /** Specialist moves an approved job forward: schedule → start → complete. */
  setStatus: specialistQuery
    .input(
      z.object({
        id: z.number().int(),
        status: z.enum(["scheduled", "in_progress", "completed"]),
        note: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const name = ({ scheduled: "schedule", in_progress: "startWork", completed: "complete" } as const)[
        input.status
      ];
      await applyTransition({
        id: input.id,
        name,
        actorId: ctx.user.id,
        scope: "any",
        note: input.note,
        guard: (row) =>
          name === "schedule" && !row.technicianId ? "Assign a professional before scheduling" : null,
      });
      if (name === "schedule") await notify.scheduled(input.id);
      if (name === "complete") await notify.completed(input.id);
      return { ok: true };
    }),

  /** Specialist prepares the job: what's likely wrong, what to bring, how to proceed. */
  prepare: specialistQuery
    .input(
      z.object({
        id: z.number().int(),
        diagnosis: z.string().trim().max(2000),
        tools: z.string().trim().max(2000),
        parts: z.string().trim().max(2000),
        instructions: z.string().trim().max(4000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const row = await findRequest(db, input.id, "any");
      if (CLOSED.includes(row.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This request is closed" });
      }
      const empty = (v: string) => v || null;
      await db
        .update(serviceRequests)
        .set({
          prepDiagnosis: empty(input.diagnosis),
          prepTools: empty(input.tools),
          prepParts: empty(input.parts),
          prepInstructions: empty(input.instructions),
          preparedAt: new Date(),
        })
        .where(eq(serviceRequests.id, row.id));
      await logEvent(db, row.id, "prepared", ctx.user.id);
      return { ok: true };
    }),
});
