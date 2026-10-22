import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { adminQuery, createRouter, specialistQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { pricingSettings, serviceRequests, technicianApplications, users } from "../db/schema";
import { ACTIVE_JOB_STATUSES } from "@contracts/workflow";
import { CUSTOMER_SERVICES } from "@contracts/services";
import { TRANSPORT } from "@contracts/applications";
import { distanceKm } from "@contracts/geo";
import {
  EMPTY_PRICING,
  MAX_PRICE_USD,
  suggestPrice,
  type PricingSettings,
} from "@contracts/pricing";
import { findRequest } from "./lib/workflow";
import { profilePhotoUrls } from "./lib/storage";
import { ratingsFor } from "./queries/ratings";
import { audit } from "./lib/audit";

type Db = ReturnType<typeof getDb>;

const amount = z.number().finite().min(0).max(MAX_PRICE_USD);
const km = z.number().finite().min(0).max(2000);

const settingsInput = z.object({
  services: z.partialRecord(z.enum(CUSTOMER_SERVICES as [string, ...string[]]), amount),
  transport: z.partialRecord(z.enum(TRANSPORT), z.object({ perKm: amount.nullable(), maxKm: km.nullable() })),
  minimum: amount.nullable(),
});

export async function loadPricing(db: Db = getDb()): Promise<PricingSettings> {
  const row = await db.query.pricingSettings.findFirst({ where: eq(pricingSettings.id, 1) });
  return row?.settings ?? EMPTY_PRICING;
}

/**
 * Every technician with a suggested price for one request (see contracts/pricing.ts): their
 * trade first, then those within reach of their transport, nearest first.
 */
export async function priceTechnicians(
  db: Db,
  job: { category: string; lat: number | null; lng: number | null },
  settings: PricingSettings,
) {
  const techs = await db
    .select({ id: users.id, name: users.name, email: users.email, avatar: users.avatar, baseLat: users.baseLat, baseLng: users.baseLng })
    .from(users)
    .where(eq(users.role, "technician"));
  if (!techs.length) return [];
  const ids = techs.map((x) => x.id);
  const [apps, active, ratings, photos] = await Promise.all([
    db
      .select({ hiredUserId: technicianApplications.hiredUserId, trade: technicianApplications.trade, transport: technicianApplications.transport })
      .from(technicianApplications)
      .where(inArray(technicianApplications.hiredUserId, ids)),
    db
      .select({ technicianId: serviceRequests.technicianId, n: sql<number>`count(*)::int` })
      .from(serviceRequests)
      .where(and(inArray(serviceRequests.technicianId, ids), inArray(serviceRequests.status, [...ACTIVE_JOB_STATUSES])))
      .groupBy(serviceRequests.technicianId),
    ratingsFor(ids),
    profilePhotoUrls(techs.map((x) => x.avatar)),
  ]);
  const pin = job.lat != null && job.lng != null ? { lat: job.lat, lng: job.lng } : null;
  const rows = techs.map((x) => {
    const app = apps.find((a) => a.hiredUserId === x.id);
    const base = x.baseLat != null && x.baseLng != null ? { lat: x.baseLat, lng: x.baseLng } : null;
    const straightKm = pin && base ? distanceKm(base, pin) : null;
    const transport = app?.transport ?? null;
    return {
      id: x.id,
      name: x.name ?? x.email,
      photoUrl: (x.avatar && photos[x.avatar]) || null,
      trade: app?.trade ?? null,
      sameTrade: app?.trade === job.category,
      transport,
      activeJobs: active.find((a) => a.technicianId === x.id)?.n ?? 0,
      rating: ratings.get(x.id) ?? { average: null, count: 0 },
      price: suggestPrice(settings, job, { transport, straightKm }),
    };
  });
  const order = (r: (typeof rows)[number]) => [r.sameTrade ? 0 : 1, r.price.tooFar ? 1 : 0, r.price.roadKm ?? Infinity];
  return rows.sort((a, b) => {
    const [x, y] = [order(a), order(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
}

export const pricingRouter = createRouter({
  /** The price table (specialists read it; admins change it). */
  get: specialistQuery.query(() => loadPricing()),

  /** Admin: save the whole price table. */
  save: adminQuery.input(settingsInput).mutation(async ({ ctx, input }) => {
    const settings: PricingSettings = input;
    await getDb().transaction(async (tx) => {
      await tx
        .insert(pricingSettings)
        .values({ id: 1, settings, updatedBy: ctx.user.id })
        .onConflictDoUpdate({ target: pricingSettings.id, set: { settings, updatedBy: ctx.user.id, updatedAt: new Date() } });
      await audit({ actorId: ctx.user.id, action: "prices_changed" }, tx);
    });
    return { ok: true };
  }),

  /** Specialist: the technicians who could do this request, each with a suggested price. */
  suggest: specialistQuery.input(z.object({ id: z.number().int() })).query(async ({ input }) => {
    const db = getDb();
    const [row, settings] = await Promise.all([findRequest(db, input.id, "any"), loadPricing(db)]);
    const technicians = await priceTechnicians(db, row, settings);
    return { hasPin: row.lat != null && row.lng != null, technicians };
  }),
});
