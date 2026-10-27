import { z } from "zod";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { authedQuery, createRouter } from "./middleware";
import { getDb } from "./queries/connection";
import { pushDevices } from "../db/schema";

/** A person rarely has more phones than this; older ones are dropped. */
const MAX_DEVICES_PER_PERSON = 5;

export const pushRouter = createRouter({
  /**
   * The app on this phone can get notifications: remember its Firebase address for whoever is
   * signed in (a phone passed to someone else moves to them), in the app's language.
   */
  register: authedQuery
    .input(
      z.object({
        token: z.string().trim().min(20).max(512),
        platform: z.enum(["android", "ios"]),
        lang: z.enum(["en", "ar"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const now = new Date();
      await db
        .insert(pushDevices)
        .values({ userId: ctx.user.id, token: input.token, platform: input.platform, lang: input.lang, lastSeenAt: now })
        .onConflictDoUpdate({
          target: pushDevices.token,
          set: { userId: ctx.user.id, platform: input.platform, lang: input.lang, lastSeenAt: now },
        });
      const keep = await db
        .select({ id: pushDevices.id })
        .from(pushDevices)
        .where(eq(pushDevices.userId, ctx.user.id))
        .orderBy(desc(pushDevices.lastSeenAt))
        .limit(MAX_DEVICES_PER_PERSON);
      await db.delete(pushDevices).where(
        and(
          eq(pushDevices.userId, ctx.user.id),
          notInArray(
            pushDevices.id,
            keep.map((d) => d.id),
          ),
        ),
      );
      return { ok: true };
    }),

  /** Notifications turned off on this phone, or signing out: forget it. */
  unregister: authedQuery.input(z.object({ token: z.string().trim().max(512) })).mutation(async ({ ctx, input }) => {
    await getDb()
      .delete(pushDevices)
      .where(and(eq(pushDevices.token, input.token), eq(pushDevices.userId, ctx.user.id)));
    return { ok: true };
  }),
});
