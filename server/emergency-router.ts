import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery, specialistQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { emergencyRequests, serviceRequests, users } from "../db/schema";
import { EMERGENCY_PROBLEM_MAP } from "@contracts/emergency";
import { isValidPin } from "@contracts/geo";
import { VISIT_FEE_USD } from "@contracts/legal";
import { isValidPhone } from "@contracts/phone";
import { CATEGORY_MAP } from "@contracts/services";
import { earliestTodayAnywhere, isValidVisitDate, QUOTE_AMOUNT_PATTERN, TIME_SLOTS } from "@contracts/workflow";
import { clientIp, LIMITS, rateLimit } from "./lib/rateLimit";
import { logEvent } from "./lib/workflow";
import { notify } from "./notify";

export const emergencyRouter = createRouter({
  /**
   * Priority dispatch, from the customer: what's wrong and where, sent just before they call
   * the emergency line. The specialist who answers finds it waiting in the dashboard.
   */
  report: publicQuery
    .input(
      z.object({
        problem: z.string().max(64),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        address: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!EMERGENCY_PROBLEM_MAP[input.problem]) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown emergency" });
      if (!isValidPin(input.lat, input.lng)) throw new TRPCError({ code: "BAD_REQUEST", message: "Place the pin on your address" });
      await rateLimit(`emergency:ip:${clientIp(ctx.req)}`, LIMITS.emergencyPerIp);
      const [created] = await getDb()
        .insert(emergencyRequests)
        .values({
          userId: ctx.user?.id ?? null,
          problem: input.problem,
          lat: input.lat,
          lng: input.lng,
          address: input.address || null,
        })
        .returning({ id: emergencyRequests.id });
      await notify.emergencyReported(created.id);
      return { id: created.id };
    }),

  /** Sent emergencies waiting for the call, newest first, with the account's name and phone if any. */
  waiting: specialistQuery.query(async () => {
    const rows = await getDb()
      .select({ emergency: emergencyRequests, name: users.name, phone: users.phone })
      .from(emergencyRequests)
      .leftJoin(users, eq(emergencyRequests.userId, users.id))
      .where(eq(emergencyRequests.status, "open"))
      .orderBy(desc(emergencyRequests.createdAt))
      .limit(100);
    return rows.map((r) => ({ ...r.emergency, name: r.name, phone: r.phone }));
  }),

  /** Not a real emergency, or handled without a technician: take it off the list. */
  dismiss: specialistQuery.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const [row] = await getDb()
      .update(emergencyRequests)
      .set({ status: "dismissed", handledBy: ctx.user.id, handledAt: new Date() })
      .where(and(eq(emergencyRequests.id, input.id), eq(emergencyRequests.status, "open")))
      .returning({ id: emergencyRequests.id });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Already handled" });
    return { ok: true };
  }),

  /**
   * Send a technician: the specialist on the call fills in the rest. The job is created
   * already approved (price agreed on the phone) and scheduled for now, in the technician's
   * app, marked Emergency. From a sent emergency (`emergencyId`), a signed-in customer also
   * sees it in their requests.
   */
  create: specialistQuery
    .input(
      z.object({
        emergencyId: z.number().int().optional(),
        category: z.string().max(64),
        /** What's wrong, as the customer described it on the phone. */
        problem: z.string().trim().min(2).max(2000),
        name: z.string().trim().min(2).max(255),
        phone: z.string().trim().max(32).refine(isValidPhone, "Invalid phone number"),
        address: z.string().trim().min(1).max(1000),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        technicianId: z.number().int(),
        amount: z.string().trim().regex(QUOTE_AMOUNT_PATTERN, "Enter the amount in USD, e.g. 45 or 45.50"),
        /** The specialist's own today and time of day, so the visit isn't dated in another time zone. */
        visitDate: z.string().max(10),
        timeSlot: z.enum(TIME_SLOTS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!CATEGORY_MAP[input.category]) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown service" });
      if (!isValidPin(input.lat, input.lng)) throw new TRPCError({ code: "BAD_REQUEST", message: "Place the pin on the address" });
      if (!isValidVisitDate(input.visitDate, earliestTodayAnywhere())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid visit date" });
      }
      const db = getDb();
      const tech = await db.query.users.findFirst({ where: eq(users.id, input.technicianId) });
      if (!tech || tech.role !== "technician" || tech.deletedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a technician" });
      }
      const requestId = await db.transaction(async (tx) => {
        let customerId: number | null = null;
        if (input.emergencyId) {
          const [sent] = await tx.select().from(emergencyRequests).where(eq(emergencyRequests.id, input.emergencyId)).for("update");
          if (!sent) throw new TRPCError({ code: "NOT_FOUND", message: "Emergency not found" });
          if (sent.status !== "open") throw new TRPCError({ code: "BAD_REQUEST", message: "This emergency was already handled" });
          // The job belongs to the sender's account only if they are a customer.
          const owner = sent.userId ? await tx.query.users.findFirst({ where: eq(users.id, sent.userId) }) : undefined;
          if (owner && owner.role === "customer" && !owner.deletedAt) customerId = owner.id;
        }
        const [job] = await tx
          .insert(serviceRequests)
          .values({
            userId: customerId,
            contactName: input.name,
            emergency: true,
            technicianId: tech.id,
            category: input.category,
            answers: JSON.stringify({}),
            status: "scheduled",
            preferredDate: input.visitDate,
            timeSlot: input.timeSlot,
            area: input.address.split(",")[0].trim().slice(0, 255) || input.address.slice(0, 255),
            address: input.address,
            lat: input.lat,
            lng: input.lng,
            phone: input.phone,
            notes: input.problem,
            quoteAmount: input.amount,
            quoteNote: "Agreed on the phone (emergency)",
            visitFee: String(VISIT_FEE_USD),
          })
          .returning({ id: serviceRequests.id });
        await logEvent(tx, job.id, "submitted", ctx.user.id, input.emergencyId ? "Priority dispatch" : "Emergency call");
        await logEvent(tx, job.id, "approved", ctx.user.id, `Price agreed on the phone: $${input.amount}`);
        await logEvent(tx, job.id, "assigned", ctx.user.id, `Technician: ${tech.name ?? tech.email ?? tech.id}`);
        await logEvent(tx, job.id, "scheduled", ctx.user.id, "Emergency: sent now");
        if (input.emergencyId) {
          await tx
            .update(emergencyRequests)
            .set({ status: "dispatched", requestId: job.id, handledBy: ctx.user.id, handledAt: new Date() })
            .where(eq(emergencyRequests.id, input.emergencyId));
        }
        return job.id;
      });
      await notify.emergencyDispatched(requestId);
      return { requestId };
    }),
});
