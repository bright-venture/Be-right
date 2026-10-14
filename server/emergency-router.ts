import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, specialistQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { serviceRequests, users } from "../db/schema";
import { isValidPin } from "@contracts/geo";
import { VISIT_FEE_USD } from "@contracts/legal";
import { isValidPhone } from "@contracts/phone";
import { CATEGORY_MAP } from "@contracts/services";
import { earliestTodayAnywhere, isValidVisitDate, QUOTE_AMOUNT_PATTERN, TIME_SLOTS } from "@contracts/workflow";
import { logEvent } from "./lib/workflow";
import { notify } from "./notify";

export const emergencyRouter = createRouter({
  /**
   * An emergency call: the customer phoned the emergency line and the specialist took the
   * details. This sends a technician at once: the job is created already approved (price
   * agreed on the phone) and scheduled for now, in the technician's app, marked Emergency.
   * The caller needn't have an account: the job keeps their name and phone.
   */
  create: specialistQuery
    .input(
      z.object({
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
        const [job] = await tx
          .insert(serviceRequests)
          .values({
            userId: null,
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
        await logEvent(tx, job.id, "submitted", ctx.user.id, "Emergency call");
        await logEvent(tx, job.id, "approved", ctx.user.id, `Price agreed on the phone: $${input.amount}`);
        await logEvent(tx, job.id, "assigned", ctx.user.id, `Technician: ${tech.name ?? tech.email ?? tech.id}`);
        await logEvent(tx, job.id, "scheduled", ctx.user.id, "Emergency: sent now");
        return job.id;
      });
      await notify.emergencyDispatched(requestId);
      return { requestId };
    }),
});
