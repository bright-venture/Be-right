import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { createRouter, specialistQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { requestEvents, requestMedia, serviceRequests, technicianLocations, users } from "../db/schema";
import { ACTIVE_JOB_STATUSES } from "@contracts/workflow";
import type { RequestStatus, UrgencyLevel } from "@contracts/services";
import {
  QUOTE_AMOUNT_PATTERN,
  URGENCY_LEVELS,
  VISIT_FEE_REASON_LABEL,
  VISIT_FEE_REASONS,
} from "@contracts/workflow";
import { applyTransition, findRequest, logEvent } from "./lib/workflow";
import { profilePhotoUrl } from "./lib/storage";
import { ratingFor, reviewOf } from "./queries/ratings";
import { TRPCError } from "@trpc/server";
import { notify } from "./notify";

const byId = z.object({ id: z.number().int() });

// Queue order: open cases first, most urgent first, then oldest first.
const CLOSED: readonly RequestStatus[] = ["completed", "cancelled"];
const URGENCY_RANK: Record<UrgencyLevel, number> = { critical: 0, urgent: 1, priority: 2, normal: 3 };

export const specialistRouter = createRouter({
  /** Can this session use the staff dashboard? (Refused without a password and two-step login.) */
  access: specialistQuery.query(() => ({ ok: true })),

  queue: specialistQuery.query(async () => {
    const rows = await getDb()
      .select({
        request: serviceRequests,
        customerName: users.name,
        customerEmail: users.email,
      })
      .from(serviceRequests)
      .leftJoin(users, eq(serviceRequests.userId, users.id))
      .orderBy(desc(serviceRequests.createdAt))
      .limit(500);
    const rank = (r: (typeof rows)[number]["request"]) => [
      CLOSED.includes(r.status) ? 1 : 0,
      URGENCY_RANK[r.urgencyFinal ?? r.urgencySuggested],
      r.createdAt.getTime(),
    ];
    return rows.sort((a, b) => {
      const [x, y] = [rank(a.request), rank(b.request)];
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    });
  }),

  detail: specialistQuery.input(byId).query(async ({ input }) => {
    const db = getDb();
    const row = await findRequest(db, input.id, "any");
    const active = ACTIVE_JOB_STATUSES.includes(row.status);
    const [customer, media, events, loc, tech] = await Promise.all([
      db.query.users.findFirst({ where: eq(users.id, row.userId) }),
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
    .input(z.object({ id: z.number().int(), urgency: z.enum(URGENCY_LEVELS) }))
    .mutation(async ({ ctx, input }) => {
      await applyTransition({
        id: input.id,
        name: "startReview",
        actorId: ctx.user.id,
        scope: "any",
        patch: { urgencyFinal: input.urgency },
        note: `Urgency confirmed: ${input.urgency}`,
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
        note: `Quote: $${input.amount}${input.note ? `. ${input.note}` : ""}`,
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
          name === "schedule" && !row.technicianId ? "Assign a technician before scheduling" : null,
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
