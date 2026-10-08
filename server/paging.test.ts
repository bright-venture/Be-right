// Long staff lists load a page at a time, and the dashboard's queue holds only what's live:
// open requests and those closed recently. Older ones load on demand.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { serviceRequests, type User } from "@db/schema";
import { BEIRUT_PIN, callerFor, createTestDb, futureDate, makeSpecialist, makeUser, type TestDb } from "./test/harness";

const state = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("./queries/connection", () => ({ getDb: () => state.db }));
vi.mock("./lib/env", () => ({
  env: {
    isProduction: false,
    databaseUrl: "",
    supabaseUrl: "",
    supabaseServiceRoleKey: "",
    storageBucket: "test",
    siteUrl: "https://be-rightbright.com",
    adminEmails: ["owner@example.com"],
  },
}));
vi.mock("./lib/storage", async (importOriginal) =>
  (await import("./test/harness")).storageStub(importOriginal),
);

const booking = {
  category: "plumbing",
  answers: { problem: "leak", location: "bathroom", flow: "large", canStop: "no", sourceVisible: "yes" },
  preferredDate: futureDate(),
  timeSlot: "morning" as const,
  area: "Achrafieh",
  address: "Building 3, floor 2",
  phone: "+961 70 000 000",
  media: [],
  ...BEIRUT_PIN,
};

let db: TestDb;
let owner: User;
let desk: User;
let rana: User;
const DAY = 86_400_000;

/** Closes a request as if it happened `daysAgo` days ago. */
async function closeAt(id: number, status: "completed" | "cancelled", daysAgo: number) {
  await db
    .update(serviceRequests)
    .set({ status, updatedAt: new Date(Date.now() - daysAgo * DAY) })
    .where(eq(serviceRequests.id, id));
}

beforeAll(async () => {
  db = await createTestDb();
  state.db = db;
  owner = await makeUser("owner@example.com", "Owner");
  desk = await makeSpecialist("desk@example.com", "Desk");
  rana = await makeUser("rana@example.com", "Rana Haddad");
  // 60 more customers: more than one page.
  for (let i = 0; i < 60; i++) await makeUser(`customer${i}@example.com`, `Customer ${i}`);
}, 120_000);

describe("customers list", () => {
  it("comes a page at a time, newest first, with the total on the first page", async () => {
    const o = await callerFor(owner);
    const first = await o.admin.customers({});
    expect(first.items).toHaveLength(50);
    expect(first.total).toBe(61);
    expect(first.items[0].email).toBe("customer59@example.com");
    const second = await o.admin.customers({ cursor: first.nextCursor });
    expect(second.items).toHaveLength(11);
    expect(second.nextCursor).toBeNull();
    expect(second.total).toBeNull();
    expect(new Set([...first.items, ...second.items].map((c) => c.id)).size).toBe(61);
  });

  it("is searched on the server, by name, email or phone, with % and _ taken literally", async () => {
    const o = await callerFor(owner);
    const found = await o.admin.customers({ search: "haddad" });
    expect(found.items.map((c) => c.email)).toEqual(["rana@example.com"]);
    expect(found.total).toBe(1);
    expect((await o.admin.customers({ search: "%" })).items).toHaveLength(0);
  });
});

describe("dashboard queue", () => {
  it("holds open requests and those closed in the last 30 days; older ones load on demand", async () => {
    const r = await callerFor(rana);
    const open = await r.requests.create(booking);
    const recent = await r.requests.create(booking);
    const old = await r.requests.create(booking);
    const oldCancelled = await r.requests.create(booking);
    await closeAt(recent.id, "completed", 3);
    await closeAt(old.id, "completed", 45);
    await closeAt(oldCancelled.id, "cancelled", 60);

    const d = await callerFor(desk);
    const live = (await d.specialist.queue()).map((x) => x.request.id);
    expect(live).toEqual(expect.arrayContaining([open.id, recent.id]));
    expect(live).not.toContain(old.id);
    expect(live).not.toContain(oldCancelled.id);

    const older = await d.specialist.history({});
    expect(older.items.map((x) => x.request.id)).toEqual([oldCancelled.id, old.id]);
    expect(older.items[0]).toMatchObject({ customerName: "Rana Haddad" });
    expect((await d.specialist.history({ status: "completed" })).items.map((x) => x.request.id)).toEqual([old.id]);
    // A number finds that request (and anything else containing it, like an address).
    expect((await d.specialist.history({ search: `#${old.id}` })).items.map((x) => x.request.id)).toContain(old.id);
    expect((await d.specialist.history({ search: "rana" })).items).toHaveLength(2);
    expect((await d.specialist.history({ category: "electrical" })).items).toHaveLength(0);
  });

  it("says when something changed, so the dashboard reloads only then", async () => {
    const d = await callerFor(desk);
    const before = await d.specialist.queueVersion();
    expect(await d.specialist.queueVersion()).toEqual(before);
    // A new booking changes it.
    await (await callerFor(rana)).requests.create(booking);
    const afterBooking = await d.specialist.queueVersion();
    expect(afterBooking).not.toEqual(before);
    // So does any change to a request.
    const [{ id }] = await db.select({ id: serviceRequests.id }).from(serviceRequests).limit(1);
    await db.update(serviceRequests).set({ area: "Hamra", updatedAt: new Date(Date.now() + 1000) }).where(eq(serviceRequests.id, id));
    expect(await d.specialist.queueVersion()).not.toEqual(afterBooking);
  });

  it("is for staff only", async () => {
    const r = await callerFor(rana);
    await expect(r.specialist.history({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(r.specialist.queueVersion()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
