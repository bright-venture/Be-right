import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminQuery, createRouter, technicianQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { partsShops } from "../db/schema";
import { isValidPin } from "@contracts/geo";
import { isValidPhone } from "@contracts/phone";
import { SERVICES_IN_ORDER } from "@contracts/services";
import { isValidSchedule } from "@contracts/shops";

const shopInput = z.object({
  name: z.string().trim().min(2).max(255),
  phone: z.string().trim().max(64).refine(isValidPhone, "Invalid phone number"),
  address: z.string().trim().min(3).max(1000),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Empty = every trade. */
  trades: z.array(z.enum(SERVICES_IN_ORDER as [string, ...string[]])).max(SERVICES_IN_ORDER.length),
  /** Opening hours picked from lists; null or absent: not given (an older shop keeps its typed hours). */
  schedule: z
    .object({
      days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
      open: z.string().max(5).optional(),
      close: z.string().max(5).optional(),
      allDay: z.boolean().optional(),
    })
    .nullish(),
  note: z.string().trim().max(1000).optional(),
  active: z.boolean(),
});

/**
 * Partner spare-parts shops. Be Right has a written agreement with each: technicians pick
 * parts up for free and Be Right pays the shops monthly, outside the app. Admins keep the
 * list; technicians see the active shops on a map, nearest to their job first.
 */
export const shopsRouter = createRouter({
  /** Technician: the shops they can go to (active only). */
  list: technicianQuery.query(() =>
    getDb()
      .select({
        id: partsShops.id,
        name: partsShops.name,
        phone: partsShops.phone,
        address: partsShops.address,
        lat: partsShops.lat,
        lng: partsShops.lng,
        trades: partsShops.trades,
        hours: partsShops.hours,
        schedule: partsShops.schedule,
        note: partsShops.note,
      })
      .from(partsShops)
      .where(eq(partsShops.active, true))
      .orderBy(asc(partsShops.name)),
  ),

  /** Admin: every shop, paused ones included. */
  all: adminQuery.query(() => getDb().select().from(partsShops).orderBy(asc(partsShops.name))),

  /** Admin: add a shop, or change one (`id`). */
  save: adminQuery.input(shopInput.extend({ id: z.number().int().optional() })).mutation(async ({ input }) => {
    if (!isValidPin(input.lat, input.lng)) throw new TRPCError({ code: "BAD_REQUEST", message: "Place the pin on the shop" });
    if (input.schedule && !isValidSchedule(input.schedule)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Pick the days, and a closing time after the opening time" });
    }
    const schedule = input.schedule
      ? {
          days: [...new Set(input.schedule.days)].sort((a, b) => a - b),
          ...(input.schedule.allDay ? { allDay: true } : { open: input.schedule.open, close: input.schedule.close }),
        }
      : null;
    const values = {
      name: input.name,
      phone: input.phone,
      address: input.address,
      lat: input.lat,
      lng: input.lng,
      trades: [...new Set(input.trades)],
      schedule,
      // Hours picked from the lists replace an older shop's typed hours.
      ...(schedule && { hours: null }),
      note: input.note || null,
      active: input.active,
    };
    const db = getDb();
    if (input.id) {
      const [row] = await db
        .update(partsShops)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(partsShops.id, input.id))
        .returning({ id: partsShops.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return { id: row.id };
    }
    const [row] = await db.insert(partsShops).values(values).returning({ id: partsShops.id });
    return { id: row.id };
  }),

  /** Admin: delete a shop for good (to keep it on record, switch it off instead). */
  remove: adminQuery.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const removed = await getDb().delete(partsShops).where(eq(partsShops.id, input.id)).returning({ id: partsShops.id });
    if (!removed.length) throw new TRPCError({ code: "NOT_FOUND" });
    return { ok: true };
  }),
});
