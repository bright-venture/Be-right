import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { createRouter, customerQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  requestEvents,
  requestMedia,
  serviceRequests,
  technicianLocations,
  users,
} from "../db/schema";
import { CATEGORY_MAP } from "@contracts/services";
import {
  ACTIVE_JOB_STATUSES,
  CANCEL_REQUESTABLE_STATUSES,
  guaranteeEndsAt,
  MAX_BOOKING_FILES,
  MAX_BOOKING_VIDEOS,
  MAX_PROBLEM_FILES,
  isValidVisitDate,
  TIME_SLOTS,
  earliestTodayAnywhere,
  validateAnswers,
  VISIT_FEE_USD,
} from "@contracts/workflow";
import { isOwnUploadKey, profilePhotoUrl } from "./lib/storage";
import { isValidPin } from "@contracts/geo";
import { isValidPhone } from "@contracts/phone";
import { applyTransition, findRequest, logEvent, type RequestScope } from "./lib/workflow";
import { notify } from "./notify";
import { ratingFor, reviewOf } from "./queries/ratings";
import { LIMITS, rateLimit } from "./lib/rateLimit";
import { WORKMANSHIP_GUARANTEE_DAYS } from "@contracts/legal";
import { isMediaType } from "@contracts/uploads";

const mediaItem = z.object({
  key: z.string().max(512),
  fileName: z.string().max(512),
  size: z.number().int().nonnegative(),
  contentType: z.string().max(128).optional(),
});

const byId = z.object({ id: z.number().int() });

type Db = Parameters<typeof findRequest>[0];

/** For a completed job: until when it's covered, and any guarantee claim still open on it. */
async function guaranteeStatus(db: Db, requestId: number) {
  const [done] = await db
    .select({ at: requestEvents.createdAt })
    .from(requestEvents)
    .where(and(eq(requestEvents.requestId, requestId), eq(requestEvents.status, "completed")))
    .orderBy(desc(requestEvents.createdAt))
    .limit(1);
  const [claim] = await db
    .select({ id: serviceRequests.id })
    .from(serviceRequests)
    .where(and(eq(serviceRequests.guaranteeFor, requestId), notInArray(serviceRequests.status, ["completed", "cancelled"])))
    .limit(1);
  return { endsAt: done ? guaranteeEndsAt(done.at) : null, openClaimId: claim?.id ?? null };
}

/** Uploaded files must be the customer's own, with at most a couple of (unshrinkable) videos. */
function checkMedia(authId: string, media: { key: string; contentType?: string }[]) {
  if (media.some((m) => !isOwnUploadKey(authId, m.key) || (m.contentType && !isMediaType(m.contentType)))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid media" });
  }
  if (media.filter((m) => m.contentType?.startsWith("video/")).length > MAX_BOOKING_VIDEOS) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Up to ${MAX_BOOKING_VIDEOS} videos per request` });
  }
}

export const requestsRouter = createRouter({
  create: customerQuery
    .input(
      z.object({
        category: z.string().max(64),
        // A service asks a handful of questions: a bigger object is not a real booking.
        answers: z
          .record(z.string().max(64), z.string().max(500))
          .refine((answers) => Object.keys(answers).length <= 40, "Too many answers"),
        preferredDate: z.string().max(10),
        timeSlot: z.enum(TIME_SLOTS),
        area: z.string().trim().min(1).max(255),
        address: z.string().trim().min(1).max(1000),
        phone: z.string().trim().max(64).refine(isValidPhone, "Invalid phone number"),
        notes: z.string().max(4000).optional(),
        media: z.array(mediaItem).max(MAX_BOOKING_FILES).default([]),
        // Map pin for the visit address.
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.termsAcceptedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Please accept the Terms of Service and Privacy Policy" });
      }
      if (!CATEGORY_MAP[input.category]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown category" });
      }
      const answerError = validateAnswers(input.category, input.answers);
      if (answerError) throw new TRPCError({ code: "BAD_REQUEST", message: answerError });
      if (!isValidVisitDate(input.preferredDate, earliestTodayAnywhere())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a date from today onwards" });
      }
      if (!isValidPin(input.lat, input.lng)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Place the pin on your address" });
      }
      checkMedia(ctx.user.authId, input.media);
      await rateLimit(`request:user:${ctx.user.id}`, LIMITS.requestPerUser);

      const id = await getDb().transaction(async (tx) => {
        const [created] = await tx
          .insert(serviceRequests)
          .values({
            userId: ctx.user.id,
            category: input.category,
            answers: JSON.stringify(input.answers),
            status: "submitted",
            preferredDate: input.preferredDate,
            timeSlot: input.timeSlot,
            area: input.area,
            address: input.address,
            lat: input.lat,
            lng: input.lng,
            phone: input.phone,
            notes: input.notes ?? null,
            visitFee: String(VISIT_FEE_USD),
          })
          .returning({ id: serviceRequests.id });
        if (input.media.length) {
          await tx.insert(requestMedia).values(
            input.media.map((m) => ({
              requestId: created.id,
              key: m.key,
              fileName: m.fileName,
              size: m.size,
              contentType: m.contentType ?? null,
            })),
          );
        }
        await logEvent(tx, created.id, "submitted", ctx.user.id);
        return created.id;
      });
      await notify.requestSubmitted(id);
      return { id };
    }),

  mine: customerQuery.query(async ({ ctx }) => {
    return getDb()
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.userId, ctx.user.id))
      .orderBy(desc(serviceRequests.createdAt));
  }),

  get: customerQuery.input(byId).query(async ({ ctx, input }) => {
    const db = getDb();
    const scope: RequestScope = { customerId: ctx.user.id };
    const row = await findRequest(db, input.id, scope).catch(async (error) => {
      // Distinguish "someone else's request" from "doesn't exist" for clearer errors.
      if (await findRequest(db, input.id, "any").catch(() => null)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      throw error;
    });

    const active = ACTIVE_JOB_STATUSES.includes(row.status);
    const [media, events, tech, loc] = await Promise.all([
      db.select().from(requestMedia).where(eq(requestMedia.requestId, row.id)),
      db
        .select()
        .from(requestEvents)
        .where(eq(requestEvents.requestId, row.id))
        .orderBy(desc(requestEvents.createdAt)),
      row.technicianId
        ? db.query.users.findFirst({ where: eq(users.id, row.technicianId) })
        : undefined,
      row.technicianId && active
        ? db.query.technicianLocations.findFirst({
            where: eq(technicianLocations.requestId, row.id),
          })
        : undefined,
    ]);
    return {
      request: row,
      media,
      events,
      technician: row.technicianId
        ? {
            name: tech?.name ?? null,
            photoUrl: await profilePhotoUrl(tech?.avatar),
            rating: await ratingFor(row.technicianId),
          }
        : null,
      review: row.status === "completed" ? await reviewOf(row.id) : null,
      // Live location is only shared while the job is active.
      location: loc ? { lat: loc.lat, lng: loc.lng, updatedAt: loc.updatedAt } : null,
      guarantee: row.status === "completed" ? await guaranteeStatus(db, row.id) : null,
    };
  }),

  /**
   * Workmanship guarantee: something isn't right after a completed job. Creates a linked
   * request at the same address for a specialist to review (usually a free return visit).
   */
  reportProblem: customerQuery
    .input(
      z.object({
        id: z.number().int(),
        description: z.string().trim().min(10).max(2000),
        preferredDate: z.string().max(10),
        timeSlot: z.enum(TIME_SLOTS),
        media: z.array(mediaItem).max(MAX_PROBLEM_FILES).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isValidVisitDate(input.preferredDate, earliestTodayAnywhere())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a date from today onwards" });
      }
      checkMedia(ctx.user.authId, input.media);
      const id = await getDb().transaction(async (tx) => {
        // Locked, so reporting twice at once can't open two claims.
        const original = await findRequest(tx, input.id, { customerId: ctx.user.id }, true);
        if (original.status !== "completed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only completed jobs can be reported" });
        }
        const { endsAt, openClaimId } = await guaranteeStatus(tx, original.id);
        if (!endsAt || endsAt < new Date()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `The ${WORKMANSHIP_GUARANTEE_DAYS}-day guarantee for this job has ended`,
          });
        }
        if (openClaimId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `You already reported this. Follow request #${openClaimId}` });
        }
        const [claim] = await tx
          .insert(serviceRequests)
          .values({
            userId: ctx.user.id,
            guaranteeFor: original.id,
            category: original.category,
            answers: original.answers,
            status: "submitted",
            preferredDate: input.preferredDate,
            timeSlot: input.timeSlot,
            area: original.area,
            address: original.address,
            lat: original.lat,
            lng: original.lng,
            phone: original.phone,
            notes: input.description,
          })
          .returning({ id: serviceRequests.id });
        if (input.media.length) {
          await tx.insert(requestMedia).values(
            input.media.map((m) => ({
              requestId: claim.id,
              key: m.key,
              fileName: m.fileName,
              size: m.size,
              contentType: m.contentType ?? null,
            })),
          );
        }
        await logEvent(tx, claim.id, "submitted", ctx.user.id, `Guarantee claim for #${original.id}`);
        return claim.id;
      });
      await notify.guaranteeReported(id);
      return { id };
    }),

  /** `amount` is the price the customer saw: if the specialist changed it meanwhile, refuse. */
  approveQuote: customerQuery
    .input(z.object({ id: z.number().int(), amount: z.string().max(32) }))
    .mutation(async ({ ctx, input }) => {
      await applyTransition({
        id: input.id,
        name: "approveQuote",
        actorId: ctx.user.id,
        scope: { customerId: ctx.user.id },
        guard: (row) =>
          row.quoteAmount !== input.amount
            ? `The price was just updated to $${row.quoteAmount}. Please check it before approving.`
            : null,
      });
      await notify.quoteApproved(input.id);
      return { ok: true };
    }),

  /** After scheduling the customer can't cancel directly; this flags it for a specialist. */
  requestCancel: customerQuery
    .input(z.object({ id: z.number().int(), reason: z.string().trim().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const flagged = await getDb().transaction(async (tx) => {
        const row = await findRequest(tx, input.id, { customerId: ctx.user.id }, true);
        if (!CANCEL_REQUESTABLE_STATUSES.includes(row.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This request can't be cancelled this way" });
        }
        if (row.cancelRequestedAt) return false; // already asked
        await tx
          .update(serviceRequests)
          .set({ cancelRequestedAt: new Date(), cancelReason: input.reason || null })
          .where(eq(serviceRequests.id, row.id));
        await logEvent(tx, row.id, "cancel_requested", ctx.user.id, input.reason || null);
        return true;
      });
      if (flagged) await notify.cancelRequested(input.id);
      return { ok: true };
    }),

  cancel: customerQuery.input(byId).mutation(async ({ ctx, input }) => {
    await applyTransition({
      id: input.id,
      name: "cancel",
      actorId: ctx.user.id,
      scope: { customerId: ctx.user.id },
    });
    await notify.customerCancelled(input.id);
    return { ok: true };
  }),
});
