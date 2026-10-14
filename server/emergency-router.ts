import { z } from "zod";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery, specialistQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { emergencyCalls } from "../db/schema";
import { isEmergency } from "@contracts/emergency";
import { isValidPhone } from "@contracts/phone";
import { clientIp, LIMITS, rateLimit } from "./lib/rateLimit";
import { notify } from "./notify";

/** Handled emergencies stay in the dashboard list this long. */
const RECENT_HANDLED_HOURS = 48;

export const emergencyRouter = createRouter({
  /**
   * The Emergency button: logs what is wrong so the team knows who is calling and why.
   * A call back needs a name and a phone number; a call to the line doesn't (the call
   * itself reaches the team), but keeps them when given.
   */
  report: publicQuery
    .input(
      z.object({
        category: z.string().max(64),
        problem: z.string().max(64),
        kind: z.enum(["call", "callback"]),
        name: z.string().trim().max(255).optional(),
        phone: z.string().trim().max(32).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isEmergency(input.category, input.problem)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown emergency" });
      }
      const name = input.name || null;
      const phone = input.phone || null;
      if (phone && !isValidPhone(phone)) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid phone number" });
      if (input.kind === "callback" && (!name || !phone)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Enter your name and phone number so we can call you" });
      }
      await rateLimit(`emergency:ip:${clientIp(ctx.req)}`, LIMITS.emergencyPerIp);
      const [created] = await getDb()
        .insert(emergencyCalls)
        .values({ userId: ctx.user?.id ?? null, category: input.category, problem: input.problem, kind: input.kind, name, phone })
        .returning({ id: emergencyCalls.id });
      await notify.emergencyReported(created.id);
      return { id: created.id };
    }),

  /** Open emergencies, plus those handled in the last RECENT_HANDLED_HOURS, newest first. */
  list: specialistQuery.query(() =>
    getDb()
      .select()
      .from(emergencyCalls)
      .where(
        or(
          isNull(emergencyCalls.handledAt),
          gt(emergencyCalls.handledAt, new Date(Date.now() - RECENT_HANDLED_HOURS * 3_600_000)),
        ),
      )
      .orderBy(desc(emergencyCalls.createdAt))
      .limit(200),
  ),

  markHandled: specialistQuery.input(z.object({ id: z.number().int() })).mutation(async ({ ctx, input }) => {
    const [row] = await getDb()
      .update(emergencyCalls)
      .set({ handledAt: new Date(), handledBy: ctx.user.id })
      .where(and(eq(emergencyCalls.id, input.id), isNull(emergencyCalls.handledAt)))
      .returning({ id: emergencyCalls.id });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Already handled" });
    return { ok: true };
  }),
});
