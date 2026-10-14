import { z } from "zod";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery, specialistQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { emergencyCalls, serviceRequests, users } from "../db/schema";
import { emergencyLabel, isEmergency } from "@contracts/emergency";
import { isValidPin } from "@contracts/geo";
import { VISIT_FEE_USD } from "@contracts/legal";
import { isValidPhone } from "@contracts/phone";
import { earliestTodayAnywhere, isValidVisitDate, QUOTE_AMOUNT_PATTERN, TIME_SLOTS } from "@contracts/workflow";
import { clientIp, LIMITS, rateLimit } from "./lib/rateLimit";
import { logEvent } from "./lib/workflow";
import { notify } from "./notify";

/** Handled emergencies stay in the dashboard list this long. */
const RECENT_HANDLED_HOURS = 48;

const location = {
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  address: z.string().trim().max(1000).optional(),
};

const technician = alias(users, "technician");

export const emergencyRouter = createRouter({
  /**
   * The Emergency button: as the customer calls the emergency line, logs who they are, what
   * is wrong and where, so the team can match the call and send a technician.
   */
  report: publicQuery
    .input(
      z.object({
        category: z.string().max(64),
        problem: z.string().max(64),
        name: z.string().trim().min(2, "Enter your name").max(255),
        phone: z.string().trim().max(32).refine(isValidPhone, "Invalid phone number"),
        ...location,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isEmergency(input.category, input.problem)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown emergency" });
      }
      const pinned = input.lat !== undefined && input.lng !== undefined;
      if (pinned && !isValidPin(input.lat!, input.lng!)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Place the pin on your address" });
      }
      await rateLimit(`emergency:phone:${input.phone.replace(/\D/g, "").replace(/^00/, "")}`, LIMITS.emergencyPerPhone);
      await rateLimit(`emergency:ip:${clientIp(ctx.req)}`, LIMITS.emergencyPerIp);
      const [created] = await getDb()
        .insert(emergencyCalls)
        .values({
          userId: ctx.user?.id ?? null,
          category: input.category,
          problem: input.problem,
          kind: "call",
          name: input.name,
          phone: input.phone,
          lat: pinned ? input.lat! : null,
          lng: pinned ? input.lng! : null,
          address: input.address || null,
        })
        .returning({ id: emergencyCalls.id });
      await notify.emergencyReported(created.id);
      return { id: created.id };
    }),

  /**
   * Open emergencies, plus those handled in the last RECENT_HANDLED_HOURS, newest first,
   * with the technician sent (if any).
   */
  list: specialistQuery.query(async () => {
    const rows = await getDb()
      .select({ emergency: emergencyCalls, technicianName: technician.name, technicianEmail: technician.email })
      .from(emergencyCalls)
      .leftJoin(serviceRequests, eq(emergencyCalls.requestId, serviceRequests.id))
      .leftJoin(technician, eq(serviceRequests.technicianId, technician.id))
      .where(
        or(
          isNull(emergencyCalls.handledAt),
          gt(emergencyCalls.handledAt, new Date(Date.now() - RECENT_HANDLED_HOURS * 3_600_000)),
        ),
      )
      .orderBy(desc(emergencyCalls.createdAt))
      .limit(200);
    return rows.map((r) => ({ ...r.emergency, technicianName: r.technicianName ?? r.technicianEmail ?? null }));
  }),

  markHandled: specialistQuery.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const [row] = await getDb()
      .update(emergencyCalls)
      .set({ handledAt: new Date(), handledBy: ctx.user.id })
      .where(and(eq(emergencyCalls.id, input.id), isNull(emergencyCalls.handledAt)))
      .returning({ id: emergencyCalls.id });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Already handled" });
    return { ok: true };
  }),

  /**
   * Send a technician: the emergency becomes a job, already approved (the price was agreed
   * on the phone) and scheduled for now, in the technician's jobs. A signed-in customer also
   * sees it in their requests; anyone else is followed up by phone.
   */
  dispatch: specialistQuery
    .input(
      z.object({
        id: z.number().int(),
        technicianId: z.number().int(),
        amount: z.string().trim().regex(QUOTE_AMOUNT_PATTERN, "Enter the amount in USD, e.g. 45 or 45.50"),
        name: z.string().trim().max(255).optional(),
        phone: z.string().trim().max(32).refine(isValidPhone, "Invalid phone number"),
        address: z.string().trim().min(1).max(1000),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        /** The specialist's own today and time of day, so the visit isn't dated in another time zone. */
        visitDate: z.string().max(10),
        timeSlot: z.enum(TIME_SLOTS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
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
        const [call] = await tx.select().from(emergencyCalls).where(eq(emergencyCalls.id, input.id)).for("update");
        if (!call) throw new TRPCError({ code: "NOT_FOUND", message: "Emergency not found" });
        if (call.requestId) throw new TRPCError({ code: "BAD_REQUEST", message: "A technician was already sent" });
        // The job belongs to the caller's account only if they are a customer.
        const owner = call.userId ? await tx.query.users.findFirst({ where: eq(users.id, call.userId) }) : undefined;
        const customerId = owner && owner.role === "customer" && !owner.deletedAt ? owner.id : null;
        const problem = emergencyLabel(call.category, call.problem);
        const [job] = await tx
          .insert(serviceRequests)
          .values({
            userId: customerId,
            contactName: input.name || call.name || null,
            emergency: true,
            technicianId: tech.id,
            category: call.category,
            answers: JSON.stringify({}),
            status: "scheduled",
            preferredDate: input.visitDate,
            timeSlot: input.timeSlot,
            area: input.address.split(",")[0].trim().slice(0, 255) || input.address.slice(0, 255),
            address: input.address,
            lat: input.lat,
            lng: input.lng,
            phone: input.phone,
            notes: `Emergency: ${problem.en}`,
            quoteAmount: input.amount,
            quoteNote: "Agreed on the phone (emergency)",
            visitFee: String(VISIT_FEE_USD),
          })
          .returning({ id: serviceRequests.id });
        await logEvent(tx, job.id, "submitted", ctx.user.id, `Emergency button: ${problem.en}`);
        await logEvent(tx, job.id, "approved", ctx.user.id, `Price agreed on the phone: $${input.amount}`);
        await logEvent(tx, job.id, "assigned", ctx.user.id, `Technician: ${tech.name ?? tech.email ?? tech.id}`);
        await logEvent(tx, job.id, "scheduled", ctx.user.id, "Emergency: sent now");
        await tx
          .update(emergencyCalls)
          .set({
            requestId: job.id,
            handledAt: new Date(),
            handledBy: ctx.user.id,
            address: input.address,
            lat: input.lat,
            lng: input.lng,
          })
          .where(eq(emergencyCalls.id, call.id));
        return job.id;
      });
      await notify.emergencyDispatched(requestId);
      return { requestId };
    }),
});
