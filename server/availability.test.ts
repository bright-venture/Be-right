// Technicians' availability, like a ride app's "Go online", and the transport admins keep.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { auditLog, technicianApplications, technicianPresence, type User } from "@db/schema";
import { ONLINE_TIMEOUT_MINUTES } from "@contracts/presence";
import {
  BEIRUT_PIN,
  callerFor,
  createTestDb,
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

describe("technicians", () => {
  let db: TestDb;
  let admin: User, desk: User, customer: User, tech: User;

  beforeAll(async () => {
    db = await createTestDb();
    state.db = db;
    admin = await makeAdmin("owner@example.com");
    desk = await makeSpecialist();
    customer = await makeUser("nour@example.com", "Nour");
    tech = await makeTechnician("karim@example.com", "Karim");
    await db.insert(technicianApplications).values({ name: tech.name!, phone: "+961 70 000 000", trade: "plumbing", transport: "car", status: "hired", hiredUserId: tech.id });
  }, 60_000);

  it("have their transport changed by admins only", async () => {
    const a = await callerFor(admin);
    await a.tech.setTransport({ technicianId: tech.id, transport: "van" });
    expect((await (await callerFor(desk)).tech.list()).find((x) => x.id === tech.id)).toMatchObject({ transport: "van" });
    await a.tech.setTransport({ technicianId: tech.id, transport: "car" });
    await expect((await callerFor(desk)).tech.setTransport({ technicianId: tech.id, transport: "van" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(a.tech.setTransport({ technicianId: customer.id, transport: "van" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "technician_transport_set"))).toHaveLength(2);
  });

  it("go Available with their position until they go offline", async () => {
    const t = await callerFor(tech);
    const s = await callerFor(desk);
    const presenceOf = async () => (await db.select().from(technicianPresence).where(eq(technicianPresence.technicianId, tech.id)))[0];
    const listed = async () => (await s.tech.list()).find((x) => x.id === tech.id);
    expect(await t.tech.presence()).toMatchObject({ online: false });
    await expect(t.tech.ping(BEIRUT_PIN)).rejects.toMatchObject({ code: "BAD_REQUEST" }); // offline: refused
    await expect(t.tech.goOnline({ lat: 0, lng: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" }); // no real position

    await t.tech.goOnline({ ...BEIRUT_PIN, accuracy: 12 });
    expect(await t.tech.presence()).toMatchObject({ online: true });
    await t.tech.ping({ lat: BEIRUT_PIN.lat + 0.001, lng: BEIRUT_PIN.lng, accuracy: 8 });
    expect(await presenceOf()).toMatchObject({ lat: BEIRUT_PIN.lat + 0.001, accuracy: 8 });
    expect(await listed()).toMatchObject({ online: true });

    // No position for longer than the timeout (app closed): offline.
    await db
      .update(technicianPresence)
      .set({ updatedAt: new Date(Date.now() - (ONLINE_TIMEOUT_MINUTES + 1) * 60_000) })
      .where(eq(technicianPresence.technicianId, tech.id));
    expect(await t.tech.presence()).toMatchObject({ online: false });
    expect(await listed()).toMatchObject({ online: false });

    // Going offline wipes the position.
    await t.tech.goOnline(BEIRUT_PIN);
    await t.tech.goOffline();
    expect(await presenceOf()).toMatchObject({ availableSince: null, lat: null, lng: null, accuracy: null });
  });

  it("availability is for technicians only", async () => {
    for (const who of [desk, admin, customer]) {
      const c = await callerFor(who);
      await expect(c.tech.goOnline(BEIRUT_PIN)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(c.tech.ping(BEIRUT_PIN)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(c.tech.goOffline()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});
