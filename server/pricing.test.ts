// Fixed prices: admins keep the table, specialists get a suggested price per technician
// (service + region + travel), and the technician priced for is ready once the customer approves.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { auditLog, serviceRequests, technicianApplications, type User } from "@db/schema";
import { distanceKm } from "@contracts/geo";
import { EMPTY_PRICING, ROAD_FACTOR, suggestPrice, type PricingSettings } from "@contracts/pricing";
import {
  BEIRUT_PIN,
  callerFor,
  createTestDb,
  futureDate,
  makeAdmin,
  makeSpecialist,
  makeTechnician,
  makeUser,
  type TestDb,
} from "./test/harness";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("./queries/connection", () => ({ getDb: () => state.db }));
vi.mock("./lib/env", () => ({
  env: {
    isProduction: false,
    databaseUrl: "",
    supabaseUrl: "",
    supabaseServiceRoleKey: "",
    storageBucket: "test",
    docsBucket: "test-docs",
    siteUrl: "https://be-rightbright.com",
  },
}));
vi.mock("./lib/storage", async (importOriginal) =>
  (await import("./test/harness")).storageStub(importOriginal),
);
vi.mock("./lib/email", () => ({ sendEmail: async () => true }));

const PRICES: PricingSettings = {
  services: { plumbing: 25, electrical: 30 },
  regions: { mount_lebanon: 5 },
  transport: { car: { perKm: 0.5, maxKm: 50 }, motorcycle: { perKm: 0.3, maxKm: 10 } },
  minimum: 15,
};
/** Jounieh, about 13 km north of the Beirut pin. */
const JOUNIEH = { lat: 33.9808, lng: 35.6178 };

describe("suggestPrice", () => {
  it("adds service, region and travel by road, rounds up, and keeps the lowest price", () => {
    const price = suggestPrice(PRICES, { category: "plumbing", region: "mount_lebanon" }, { transport: "car", straightKm: 12 });
    expect(price).toMatchObject({ service: 25, region: 5, roadKm: 15.6, travel: 7.8, total: 38, tooFar: false, gaps: [] });

    const cheap = suggestPrice({ ...PRICES, services: { plumbing: 2 } }, { category: "plumbing", region: "beirut" }, { transport: "car", straightKm: 1 });
    expect(cheap.total).toBe(15);
    // never below the visit fee, even with a lower minimum
    const floor = suggestPrice({ ...PRICES, services: { plumbing: 2 }, minimum: 1 }, { category: "plumbing", region: "beirut" }, { transport: "car", straightKm: 0 });
    expect(floor.total).toBe(10);
  });

  it("says what is missing, and who is too far for their transport", () => {
    expect(suggestPrice(EMPTY_PRICING, { category: "plumbing", region: null }, { transport: null, straightKm: null })).toMatchObject({
      total: null,
      travel: null,
      gaps: ["service", "region", "start", "transport"],
    });
    const far = suggestPrice(PRICES, { category: "plumbing", region: "beirut" }, { transport: "motorcycle", straightKm: 20 });
    expect(far).toMatchObject({ tooFar: true, region: 0, total: 25 + Math.ceil(0.3 * 26) });
  });
});

describe("prices", () => {
  let db: TestDb;
  let admin: User, desk: User, customer: User, near: User, far: User, painter: User, noStart: User;

  beforeAll(async () => {
    db = await createTestDb();
    state.db = db;
    admin = await makeAdmin("owner@example.com");
    desk = await makeSpecialist();
    customer = await makeUser("nour@example.com", "Nour");
    near = await makeTechnician("ali@example.com", "Ali");
    far = await makeTechnician("karim@example.com", "Karim");
    painter = await makeTechnician("rami@example.com", "Rami");
    noStart = await makeTechnician("sami@example.com", "Sami");
    // Technicians come from applications: their trade and transport are kept there.
    for (const [tech, trade, transport] of [
      [near, "plumbing", "car"],
      [far, "plumbing", "motorcycle"],
      [painter, "painting", "car"],
      [noStart, "plumbing", "car"],
    ] as const) {
      await db.insert(technicianApplications).values({ name: tech.name!, phone: "+961 70 000 000", trade, transport, status: "hired", hiredUserId: tech.id });
    }
  }, 60_000);

  const booking = {
    category: "plumbing",
    answers: { problem: "fixture" },
    preferredDate: futureDate(),
    timeSlot: "morning" as const,
    area: "Achrafieh",
    region: "beirut" as const,
    address: "Building 4, 2nd floor",
    phone: "+961 70 111 222",
    media: [],
    ...BEIRUT_PIN,
  };

  it("are set by admins only, and checked", async () => {
    const a = await callerFor(admin);
    await a.pricing.save(PRICES);
    expect(await (await callerFor(desk)).pricing.get()).toEqual(PRICES);
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "prices_changed"))).toHaveLength(1);

    await expect((await callerFor(desk)).pricing.save(PRICES)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect((await callerFor(customer)).pricing.get()).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const bad of [
      { ...PRICES, services: { plumbing: -1 } },
      { ...PRICES, services: { hacking: 5 } },
      { ...PRICES, regions: { mars: 5 } },
      { ...PRICES, transport: { rocket: { perKm: 1, maxKm: null } } },
    ]) {
      await expect(a.pricing.save(bad as PricingSettings)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  it("use each technician's starting point and transport, which admins set", async () => {
    const a = await callerFor(admin);
    await a.tech.setBase({ technicianId: near.id, ...JOUNIEH, transport: "car" });
    await a.tech.setBase({ technicianId: far.id, lat: 34.4367, lng: 35.8497, transport: "motorcycle" }); // Tripoli
    await a.tech.setBase({ technicianId: painter.id, ...JOUNIEH, transport: "car" });
    await expect((await callerFor(desk)).tech.setBase({ technicianId: near.id, ...JOUNIEH, transport: "car" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(a.tech.setBase({ technicianId: near.id, lat: 0, lng: 0, transport: "car" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(a.tech.setBase({ technicianId: customer.id, ...JOUNIEH, transport: "car" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const listed = (await (await callerFor(desk)).tech.list()).find((x) => x.id === near.id);
    expect(listed).toMatchObject({ transport: "car", base: JOUNIEH });
  });

  it("suggest every technician for a request: same trade first, within reach, nearest", async () => {
    const { id } = await (await callerFor(customer)).requests.create(booking);
    expect((await db.select().from(serviceRequests).where(eq(serviceRequests.id, id)))[0].region).toBe("beirut");
    const s = await callerFor(desk);
    const { region, technicians } = await s.pricing.suggest({ id });
    expect(region).toBe("beirut");
    expect(technicians.map((x) => x.id)).toEqual([near.id, noStart.id, far.id, painter.id]);

    const roadKm = Math.round(distanceKm(JOUNIEH, BEIRUT_PIN) * ROAD_FACTOR * 10) / 10;
    expect(technicians[0]).toMatchObject({ sameTrade: true, transport: "car", price: { service: 25, region: 0, roadKm, tooFar: false } });
    expect(technicians[0].price.total).toBe(Math.max(15, Math.ceil(25 + Math.round(0.5 * roadKm * 100) / 100)));
    expect(technicians[1].price).toMatchObject({ gaps: ["start"], total: 25 });
    expect(technicians[2].price.tooFar).toBe(true);
    expect(technicians[3].sameTrade).toBe(false);

    // another region for the same request
    const moved = await s.pricing.suggest({ id, region: "mount_lebanon" });
    expect(moved.technicians[0].price.region).toBe(5);
    await expect((await callerFor(near)).pricing.suggest({ id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keep the technician priced for, ready to assign once the customer approves", async () => {
    const c = await callerFor(customer);
    const s = await callerFor(desk);
    const { id } = await c.requests.create({ ...booking, region: undefined });
    await s.specialist.startReview({ id });
    const { technicians } = await s.pricing.suggest({ id, region: "mount_lebanon" });
    const total = technicians[0].price.total!;
    await s.specialist.sendQuote({ id, amount: String(total), technicianId: near.id, region: "mount_lebanon" });

    const [row] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, id));
    expect(row).toMatchObject({ region: "mount_lebanon", suggestedTechnicianId: near.id, technicianId: null, quoteAmount: String(total) });
    expect(row.priceBreakdown).toMatchObject({ suggested: total, service: 25, region: 5 });

    // a price typed by hand forgets the technician
    await s.specialist.sendQuote({ id, amount: "60" });
    const [typed] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, id));
    expect(typed).toMatchObject({ suggestedTechnicianId: null, priceBreakdown: null, quoteAmount: "60", region: "mount_lebanon" });

    await expect(s.specialist.sendQuote({ id, amount: "60", technicianId: customer.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
