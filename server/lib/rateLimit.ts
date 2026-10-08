import { lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { rateLimits } from "@db/schema";
import { getDb } from "../queries/connection";

type Limit = { limit: number; windowSeconds: number };
const HOUR = 3600;
const DAY = 24 * HOUR;

/**
 * Caps on endpoints that write files or rows for anonymous visitors. Generous for real
 * people (an applicant uploads 2 documents, maybe replacing one), tight for scripts.
 * Lebanese mobile carriers put many phones behind one IP, so per-IP caps stay loose and
 * the daily total is what actually protects storage.
 */
export const LIMITS = {
  /** Technician documents (up to 10 MB each) from one IP. */
  documentUploadPerIp: { limit: 10, windowSeconds: HOUR },
  /** Technician documents from everyone: at most ~600 MB a day before the orphan clean-up. */
  documentUploadPerDay: { limit: 60, windowSeconds: DAY },
  /** Technician applications from one IP. */
  applicationPerIp: { limit: 5, windowSeconds: HOUR },
  /** Booking photos/videos by one customer (8 per booking). */
  mediaUploadPerUser: { limit: 40, windowSeconds: HOUR },
  /** Bookings by one customer: each one emails every specialist. */
  requestPerUser: { limit: 20, windowSeconds: HOUR },
  /** "Nothing repaired" reports by a technician on one job: each one emails every specialist. */
  visitReportPerJob: { limit: 3, windowSeconds: DAY },
  /** Crash reports from one browser's IP (a page sends at most 5). */
  clientErrorPerIp: { limit: 20, windowSeconds: HOUR },
} satisfies Record<string, Limit>;

/** The visitor's IP as Netlify reports it; locally there is none, so everyone shares one bucket. */
export function clientIp(req: Request) {
  const h = req.headers;
  return h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * Counts one hit for `key` and refuses with 429 once the window's limit is passed.
 * Fixed windows in Postgres: one upsert, so it works across serverless instances.
 */
export async function rateLimit(key: string, { limit, windowSeconds }: Limit) {
  const now = new Date();
  // ISO string + cast: the production driver can't bind a Date inside raw SQL.
  const nowIso = now.toISOString();
  const expired = sql`${rateLimits.windowStart} <= ${new Date(now.getTime() - windowSeconds * 1000).toISOString()}::timestamptz`;
  const [row] = await getDb()
    .insert(rateLimits)
    .values({ key: key.slice(0, 128), windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      // Both expressions read the row as it was before this update.
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${expired} then ${nowIso}::timestamptz else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count });
  if (row.count > limit) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many attempts. Please try again later." });
  }
}

/** Drops counters whose window ended long ago (run daily). */
export async function purgeExpiredRateLimits(now = new Date()) {
  const cutoff = new Date(now.getTime() - 2 * DAY);
  const removed = await getDb()
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, cutoff))
    .returning({ key: rateLimits.key });
  return removed.length;
}
