import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, customerQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { reviews } from "../db/schema";
import { findRequest } from "./lib/workflow";
import { reviewOf } from "./queries/ratings";

export const reviewsRouter = createRouter({
  /** The customer rates a completed job, once. The average shows on technician cards. */
  submit: customerQuery
    .input(
      z.object({
        requestId: z.number().int(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await findRequest(getDb(), input.requestId, { customerId: ctx.user.id });
      if (row.status !== "completed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only completed jobs can be rated" });
      }
      if (await reviewOf(row.id)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You already rated this job" });
      }
      await getDb()
        .insert(reviews)
        .values({
          requestId: row.id,
          userId: ctx.user.id,
          technicianId: row.technicianId,
          category: row.category,
          rating: input.rating,
          comment: input.comment || null,
        })
        // Two taps at once: the unique request id keeps it to one rating.
        .onConflictDoNothing({ target: reviews.requestId });
      return { ok: true };
    }),
});
