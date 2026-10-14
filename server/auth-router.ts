import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createRouter, authedQuery, customerQuery, publicQuery, specialistQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { emergencyRequests, requestEvents, requestMedia, reviews, serviceRequests, technicianLocations, users } from "../db/schema";
import { LEGAL_VERSION } from "@contracts/legal";
import { isValidPhone } from "@contracts/phone";
import { canTransition } from "@contracts/workflow";
import type { RequestStatus } from "@contracts/services";
import { deleteFiles } from "./lib/storage";
import { deleteAuthUser } from "./lib/accounts";
import { audit } from "./lib/audit";
import { isAdminEmail } from "./queries/users";
import { logEvent } from "./lib/workflow";
import { notify } from "./notify";

/** Visits already on someone's calendar: the account can't disappear under them. */
const BOOKED: readonly RequestStatus[] = ["scheduled", "in_progress"];
const ERASED = "(deleted)";

export const authRouter = createRouter({
  // Returns null for anonymous visitors so the UI can render without an error.
  me: publicQuery.query(({ ctx }) => {
    if (ctx.accountLoadFailed) {
      // Signed in with Supabase, but the app account couldn't be loaded: say so
      // instead of looking signed out (which made "Sign in" appear to do nothing).
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Signed in, but your account couldn't be loaded. Please try again shortly.",
      });
    }
    return ctx.user ?? null;
  }),

  /** Record that the signed-in user accepts the current Terms and Privacy Policy. */
  acceptTerms: authedQuery.mutation(async ({ ctx }) => {
    await getDb()
      .update(users)
      .set({ termsAcceptedAt: new Date(), termsVersion: LEGAL_VERSION })
      .where(eq(users.id, ctx.user.id));
    return { ok: true, version: LEGAL_VERSION };
  }),

  /** Name and phone, as shown to the team and used to fill in bookings. */
  updateProfile: authedQuery
    .input(
      z.object({
        name: z.string().trim().min(2).max(255),
        phone: z.string().trim().max(64).refine(isValidPhone, "Invalid phone number"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getDb().update(users).set({ name: input.name, phone: input.phone }).where(eq(users.id, ctx.user.id));
      return { ok: true };
    }),

  /**
   * A customer deletes their account (Privacy Policy, "Your rights"). Personal details are
   * erased; what the business must keep (which services, when, at what price) stays,
   * without anything that identifies the person.
   */
  deleteAccount: customerQuery.mutation(async ({ ctx }) => {
    const user = ctx.user;
    const { mediaKeys, cancelled } = await getDb().transaction(async (tx) => {
      const requests = await tx
        .select({ id: serviceRequests.id, status: serviceRequests.status })
        .from(serviceRequests)
        .where(eq(serviceRequests.userId, user.id))
        .for("update");
      const booked = requests.find((r) => BOOKED.includes(r.status));
      if (booked) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Your visit #${booked.id} is booked. Ask to cancel it first, or wait until the job is done.`,
        });
      }
      // Requests still being handled are cancelled, as if the customer had cancelled them.
      const open = requests.filter((r) => canTransition("cancel", r.status)).map((r) => r.id);
      if (open.length) {
        await tx.update(serviceRequests).set({ status: "cancelled" }).where(inArray(serviceRequests.id, open));
        for (const id of open) await logEvent(tx, id, "cancelled", user.id, "The customer deleted their account");
      }
      const ids = requests.map((r) => r.id);
      const media = ids.length
        ? await tx.select({ key: requestMedia.key }).from(requestMedia).where(inArray(requestMedia.requestId, ids))
        : [];
      if (ids.length) {
        await tx.delete(requestMedia).where(inArray(requestMedia.requestId, ids));
        await tx.delete(technicianLocations).where(inArray(technicianLocations.requestId, ids));
        await tx
          .update(serviceRequests)
          .set({ address: ERASED, phone: ERASED, notes: null, lat: null, lng: null, cancelReason: null })
          .where(inArray(serviceRequests.id, ids));
        // What the customer wrote: rating comments (the stars stay, anonymous) and timeline notes.
        await tx.update(reviews).set({ comment: null }).where(eq(reviews.userId, user.id));
        await tx
          .update(requestEvents)
          .set({ note: null })
          .where(and(inArray(requestEvents.requestId, ids), eq(requestEvents.actorId, user.id)));
      }
      // Sent emergencies hold where the customer was: gone with the account.
      await tx.delete(emergencyRequests).where(eq(emergencyRequests.userId, user.id));
      await tx
        .update(users)
        // deletedAt also shuts out the old sign-in while it is still valid (see findOrCreateUser).
        .set({ name: null, email: null, phone: null, avatar: null, deletedAt: new Date() })
        .where(eq(users.id, user.id));
      return { mediaKeys: media.map((m) => m.key), cancelled: open };
    });

    // After the database: tell the team, delete files and the sign-in. Each failure is
    // logged and retried by hand or by the daily clean-up; the account is already anonymous.
    for (const id of cancelled) await notify.customerCancelled(id);
    try {
      if (mediaKeys.length) await deleteFiles("media", mediaKeys);
    } catch (error) {
      console.error("[deleteAccount] photos not deleted", error);
    }
    try {
      await deleteAuthUser(user.authId);
    } catch (error) {
      console.error("[deleteAccount] sign-in not deleted", user.authId, error);
    }
    return { ok: true };
  }),

  /**
   * A specialist or admin deletes their own account: name, email and phone are erased and
   * the sign-in is deleted. What they did (requests handled, the audit trail) stays, under a
   * deleted account. Be Right always keeps one admin; ADMIN_EMAILS admins are set on the server.
   */
  deleteStaffAccount: specialistQuery.mutation(async ({ ctx }) => {
    const user = ctx.user;
    if (isAdminEmail(user.email)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Your admin account is set in the server settings (ADMIN_EMAILS). Remove it there first.",
      });
    }
    await getDb().transaction(async (tx) => {
      if (user.role === "admin") {
        // Lock every admin row, as when an admin is removed from the team: never zero admins.
        const admins = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, "admin"), isNull(users.deletedAt)))
          .for("update");
        if (admins.length <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You're the only admin. Make someone else admin in Team first.",
          });
        }
      }
      await tx
        .update(users)
        .set({ name: null, email: null, phone: null, avatar: null, deletedAt: new Date() })
        .where(eq(users.id, user.id));
      await audit({ actorId: user.id, action: "staff_account_deleted", targetUserId: user.id, details: { role: user.role } }, tx);
    });
    try {
      await deleteAuthUser(user.authId);
    } catch (error) {
      console.error("[deleteStaffAccount] sign-in not deleted", user.authId, error);
    }
    return { ok: true };
  }),
});
