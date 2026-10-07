import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { adminQuery, createRouter } from "./middleware";
import { getDb } from "./queries/connection";
import { requestEvents, reviews, serviceRequests, technicianApplications, users } from "../db/schema";
import { getSupabaseAdmin } from "./lib/supabase";
import { env } from "./lib/env";

/** Roles an admin hands out in the team screen (technicians come from hiring applications). */
const STAFF_ROLES = ["specialist", "admin"] as const;
const DAY = 86_400_000;

/** Admins listed in ADMIN_EMAILS: the setting makes them admin again at sign-in, so it's locked here. */
function roleFromSettings(email: string | null) {
  const e = email?.toLowerCase();
  return e && (env.adminEmails ?? []).includes(e) ? ("admin" as const) : null;
}

/** Whether an account has two-step login set up (null when it can't be checked). */
async function hasTwoStep(authId: string): Promise<boolean | null> {
  try {
    const { data, error } = await getSupabaseAdmin().auth.admin.mfa.listFactors({ userId: authId });
    if (error) return null;
    return data.factors.some((f) => f.status === "verified");
  } catch {
    return null;
  }
}

/** Where a staff invitation lands: choose a password, then the dashboard. */
function staffInviteRedirect(req: Request) {
  const origin = req.headers.get("origin") ?? env.siteUrl;
  return /^https?:\/\//.test(origin) ? `${origin}/reset-password?next=${encodeURIComponent("/dashboard")}&welcome=1` : undefined;
}

/**
 * The admin area (/admin): figures, every customer, the team, and what happened when.
 * Admins also have every specialist action (dashboard, applications, technicians).
 */
export const adminRouter = createRouter({
  /** Can this session use the admin area? (Refused unless an admin signed in with a password.) */
  access: adminQuery.query(() => ({ ok: true })),

  /** The numbers at a glance. */
  overview: adminQuery.query(async () => {
    const db = getDb();
    const now = Date.now();
    const week = new Date(now - 7 * DAY).toISOString();
    const month = new Date(now - 30 * DAY).toISOString();

    const [byStatus, [periods], [money], people, applications, [rating], topServices, topAreas] = await Promise.all([
      db.select({ status: serviceRequests.status, n: count() }).from(serviceRequests).groupBy(serviceRequests.status),
      db
        .select({
          week: sql<number>`count(*) filter (where ${serviceRequests.createdAt} >= ${week}::timestamptz)::int`,
          month: sql<number>`count(*) filter (where ${serviceRequests.createdAt} >= ${month}::timestamptz)::int`,
          total: sql<number>`count(*)::int`,
        })
        .from(serviceRequests),
      db
        .select({
          // Approved prices of finished jobs, and visit fees charged on their own.
          completedValue: sql<string>`coalesce(sum(${serviceRequests.quoteAmount}::numeric) filter (where ${serviceRequests.status} = 'completed'), 0)::text`,
          visitFees: sql<string>`coalesce(sum(${serviceRequests.visitFee}::numeric) filter (where ${serviceRequests.visitFeeReason} is not null), 0)::text`,
          visitFeeJobs: sql<number>`count(*) filter (where ${serviceRequests.visitFeeReason} is not null)::int`,
        })
        .from(serviceRequests),
      db.select({ role: users.role, n: count() }).from(users).where(isNull(users.deletedAt)).groupBy(users.role),
      db
        .select({ status: technicianApplications.status, n: count() })
        .from(technicianApplications)
        .groupBy(technicianApplications.status),
      db.select({ average: sql<string | null>`round(avg(${reviews.rating}), 2)::text`, n: count() }).from(reviews),
      db
        .select({ category: serviceRequests.category, n: count() })
        .from(serviceRequests)
        .groupBy(serviceRequests.category)
        .orderBy(desc(count()))
        .limit(5),
      db
        .select({ area: serviceRequests.area, n: count() })
        .from(serviceRequests)
        .groupBy(serviceRequests.area)
        .orderBy(desc(count()))
        .limit(5),
    ]);
    const tally = <K extends string>(rows: { n: number }[], key: (r: never) => K) =>
      Object.fromEntries(rows.map((r) => [key(r as never), r.n])) as Partial<Record<K, number>>;

    return {
      requests: { ...periods, byStatus: tally(byStatus, (r: { status: string }) => r.status) },
      money: {
        completedValue: Number(money.completedValue),
        visitFees: Number(money.visitFees),
        visitFeeJobs: money.visitFeeJobs,
      },
      people: tally(people, (r: { role: string }) => r.role),
      applications: tally(applications, (r: { status: string }) => r.status),
      rating: { average: rating.average === null ? null : Number(rating.average), count: rating.n },
      topServices,
      topAreas,
    };
  }),

  /** Every customer account, newest first, with how much they've booked. */
  customers: adminQuery.query(async () => {
    return getDb()
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        createdAt: users.createdAt,
        lastSignInAt: users.lastSignInAt,
        deletedAt: users.deletedAt,
        requests: sql<number>`count(${serviceRequests.id})::int`,
        lastRequestAt: sql<string | null>`max(${serviceRequests.createdAt})::text`,
      })
      .from(users)
      .leftJoin(serviceRequests, eq(serviceRequests.userId, users.id))
      .where(eq(users.role, "customer"))
      .groupBy(users.id)
      .orderBy(desc(users.createdAt))
      .limit(5000);
  }),

  /** One customer's requests (open one in the dashboard for the details). */
  customerRequests: adminQuery.input(z.object({ id: z.number().int() })).query(async ({ input }) => {
    return getDb()
      .select({
        id: serviceRequests.id,
        category: serviceRequests.category,
        status: serviceRequests.status,
        area: serviceRequests.area,
        quoteAmount: serviceRequests.quoteAmount,
        visitFee: serviceRequests.visitFee,
        visitFeeReason: serviceRequests.visitFeeReason,
        createdAt: serviceRequests.createdAt,
      })
      .from(serviceRequests)
      .where(eq(serviceRequests.userId, input.id))
      .orderBy(desc(serviceRequests.createdAt));
  }),

  /** Specialists and admins. */
  team: adminQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select({
        id: users.id,
        authId: users.authId,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        createdAt: users.createdAt,
        lastSignInAt: users.lastSignInAt,
      })
      .from(users)
      .where(and(inArray(users.role, [...STAFF_ROLES]), isNull(users.deletedAt)))
      .orderBy(users.role, users.name);
    return Promise.all(
      rows.map(async ({ authId, ...r }) => ({
        ...r,
        fromSettings: !!roleFromSettings(r.email),
        isYou: r.id === ctx.user.id,
        twoStep: await hasTwoStep(authId),
      })),
    );
  }),

  /**
   * Add someone to the team by email: an existing account gets the role now; otherwise
   * they're invited by email and their staff account is created right away.
   */
  addStaff: adminQuery
    .input(z.object({ email: z.string().trim().toLowerCase().email().max(320), role: z.enum(STAFF_ROLES) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) });
      if (existing?.deletedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This account was deleted" });
      }
      if (existing?.role === "technician") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This email belongs to a technician. Remove them from the technicians first.",
        });
      }
      if (existing) {
        await db.update(users).set({ role: input.role }).where(eq(users.id, existing.id));
        return { ok: true, invited: false };
      }
      const { data, error } = await getSupabaseAdmin().auth.admin.inviteUserByEmail(input.email, {
        redirectTo: staffInviteRedirect(ctx.req),
      });
      if (error || !data.user) {
        const already = error && /already|registered|exists/i.test(error.message);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: already
            ? "This email already has a login. Ask them to sign in once, then add them again."
            : `Could not send the invitation: ${error?.message ?? "unknown error"}`,
        });
      }
      await db
        .insert(users)
        .values({ authId: data.user.id, email: input.email, role: input.role })
        .onConflictDoUpdate({ target: users.authId, set: { role: input.role } });
      return { ok: true, invited: true };
    }),

  /** Make a specialist an admin (or back), or take someone off the team (back to a customer account). */
  setStaffRole: adminQuery
    .input(z.object({ userId: z.number().int(), role: z.enum(["specialist", "admin", "customer"]) }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You can't change your own role" });
      }
      const db = getDb();
      const target = await db.query.users.findFirst({ where: eq(users.id, input.userId) });
      if (!target || !(STAFF_ROLES as readonly string[]).includes(target.role)) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (roleFromSettings(target.email)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This admin is set in the server settings (ADMIN_EMAILS). Change it there.",
        });
      }
      if (target.role === "admin" && input.role !== "admin") {
        const [{ admins }] = await db
          .select({ admins: count() })
          .from(users)
          .where(and(eq(users.role, "admin"), isNull(users.deletedAt)));
        if (admins <= 1) throw new TRPCError({ code: "BAD_REQUEST", message: "Be Right needs at least one admin" });
      }
      await db.update(users).set({ role: input.role }).where(eq(users.id, target.id));
      return { ok: true };
    }),

  /**
   * Someone lost the phone with their authenticator app: remove their two-step login so
   * they can set it up again at their next admin sign-in. Not for your own account.
   */
  resetTwoStep: adminQuery.input(z.object({ userId: z.number().int() })).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.user.id) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Ask another admin to reset your two-step login" });
    }
    const target = await getDb().query.users.findFirst({ where: eq(users.id, input.userId) });
    if (!target || !(STAFF_ROLES as readonly string[]).includes(target.role)) throw new TRPCError({ code: "NOT_FOUND" });
    const mfa = getSupabaseAdmin().auth.admin.mfa;
    const { data, error } = await mfa.listFactors({ userId: target.authId });
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    for (const factor of data.factors) {
      const { error: deleteError } = await mfa.deleteFactor({ id: factor.id, userId: target.authId });
      if (deleteError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: deleteError.message });
    }
    return { ok: true, removed: data.factors.length };
  }),

  /** What happened on requests, newest first, and who did it. */
  activity: adminQuery.query(async () => {
    const actor = alias(users, "actor");
    return getDb()
      .select({
        id: requestEvents.id,
        requestId: requestEvents.requestId,
        status: requestEvents.status,
        note: requestEvents.note,
        createdAt: requestEvents.createdAt,
        category: serviceRequests.category,
        actorName: actor.name,
        actorEmail: actor.email,
        actorRole: actor.role,
      })
      .from(requestEvents)
      .leftJoin(serviceRequests, eq(serviceRequests.id, requestEvents.requestId))
      .leftJoin(actor, eq(actor.id, requestEvents.actorId))
      .where(isNotNull(requestEvents.createdAt))
      .orderBy(desc(requestEvents.createdAt))
      .limit(300);
  }),
});
