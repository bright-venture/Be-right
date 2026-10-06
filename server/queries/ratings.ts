import { avg, count, eq, inArray } from "drizzle-orm";
import { reviews } from "@db/schema";
import { getDb } from "./connection";

export type Rating = { average: number | null; count: number };

/** Average stars and number of ratings per technician (technicians without ratings are absent). */
export async function ratingsFor(technicianIds: number[]): Promise<Map<number, Rating>> {
  if (!technicianIds.length) return new Map();
  const rows = await getDb()
    .select({ technicianId: reviews.technicianId, average: avg(reviews.rating), count: count() })
    .from(reviews)
    .where(inArray(reviews.technicianId, technicianIds))
    .groupBy(reviews.technicianId);
  return new Map(
    rows.map((r) => [r.technicianId!, { average: r.average === null ? null : Number(r.average), count: r.count }]),
  );
}

export async function ratingFor(technicianId: number): Promise<Rating> {
  return (await ratingsFor([technicianId])).get(technicianId) ?? { average: null, count: 0 };
}

/** The rating left on one request, if any. */
export async function reviewOf(requestId: number) {
  return (await getDb().query.reviews.findFirst({ where: eq(reviews.requestId, requestId) })) ?? null;
}
