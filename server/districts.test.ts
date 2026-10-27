// Technicians only work in their districts: a request's district comes from its pin, and
// specialists can't assign or send a technician outside theirs (an admin can, noted).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";
import { auditLog, requestEvents, serviceRequests, technicianApplications, users, type User } from "@db/schema";
import { districtAt } from "./lib/districts";
import {
  BEIRUT_PIN,
  callerFor,
  createTestDb,
  futureDate,
  makeAdmin,
  makeSpecialist,
  makeTechnician,
  makeUser,
  photoKey,
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
    adminEmails: [],
  },
}));
vi.mock("./lib/storage", async (importOriginal) =>
  (await import("./test/harness")).storageStub(importOriginal),
);
vi.mock("./lib/email", () => ({ sendEmail: async () => true }));

/** Town centres from the boundaries' own data (HDX COD-AB Lebanon). */
const SIN_EL_FIL = { lat: 33.8764, lng: 35.5351 };
const JOUNIEH = { lat: 33.9804, lng: 35.6206 };

describe("districtAt", () => {
  it("finds the district of a pin", () => {
    expect(districtAt(BEIRUT_PIN.lat, BEIRUT_PIN.lng)).toBe("beirut"); // Achrafieh
    expect(districtAt(SIN_EL_FIL.lat, SIN_EL_FIL.lng)).toBe("metn");
    expect(districtAt(33.8766, 35.5461)).toBe("metn"); // Dekwaneh
    expect(districtAt(JOUNIEH.lat, JOUNIEH.lng)).toBe("keserwan");
    expect(districtAt(33.8473, 35.9042)).toBe("zahle");
    expect(districtAt(33.5765, 35.3859)).toBe("saida");
    expect(districtAt(34.4367, 35.8497)).toBe("tripoli");
  });

  it("counts a seafront pin just off the outline, and nothing far out or abroad", () => {
    expect(districtAt(33.9005, 35.4805)).toBe("beirut"); // Corniche, by the water
    expect(districtAt(33.9, 35.0)).toBeNull(); // at sea
    expect(districtAt(48.8566, 2.3522)).toBeNull(); // Paris
    expect(districtAt(null, null)).toBeNull();
  });
});

describe("districts", () => {
  let db: TestDb;
  let admin: User, desk: User, customer: User, hassan: User, karim: User;

  beforeAll(async () => {
    db = await createTestDb();
    state.db = db;
    admin = await makeAdmin("owner@example.com");
    desk = await makeSpecialist();
    customer = await makeUser("nour@example.com", "Nour");
    hassan = await makeTechnician("hassan@example.com", "Hassan"); // Beirut and Metn
    karim = await makeTechnician("karim@example.com", "Karim"); // Keserwan only
    for (const [tech, districts] of [
      [hassan, ["beirut", "metn"]],
      [karim, ["keserwan"]],
    ] as const) {
      await db.update(users).set({ districts: [...districts] }).where(eq(users.id, tech.id));
      await db.insert(technicianApplications).values({ name: tech.name!, phone: "+961 70 000 000", trade: "plumbing", transport: "car", status: "hired", hiredUserId: tech.id });
    }
  }, 60_000);

  const booking = {
    category: "plumbing",
    answers: { problem: "fixture" },
    preferredDate: futureDate(),
    timeSlot: "morning" as const,
    area: "Sin el Fil",
    address: "Building 4, 2nd floor",
    phone: "+961 70 111 222",
    media: [],
    ...SIN_EL_FIL,
  };
  const lastEvent = async (id: number) =>
    (await db.select().from(requestEvents).where(eq(requestEvents.requestId, id)).orderBy(desc(requestEvents.id)).limit(1))[0];

  it("are saved on a request from its pin", async () => {
    const { id } = await (await callerFor(customer)).requests.create(booking);
    expect((await db.select().from(serviceRequests).where(eq(serviceRequests.id, id)))[0].district).toBe("metn");
  });

  it("stop a specialist from assigning outside them; an admin can, and it's noted", async () => {
    const c = await callerFor(customer);
    const s = await callerFor(desk);
    const a = await callerFor(admin);
    const { id } = await c.requests.create(booking);
    await s.specialist.startReview({ id });
    await s.specialist.sendQuote({ id, amount: "40" });
    await c.requests.approveQuote({ id, amount: "40" });

    await expect(s.tech.assign({ requestId: id, technicianId: karim.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await a.tech.assign({ requestId: id, technicianId: karim.id });
    expect((await lastEvent(id)).note).toContain("outside their districts");
    await s.tech.assign({ requestId: id, technicianId: hassan.id });
    expect((await lastEvent(id)).note).not.toContain("outside");
  });

  it("apply to emergencies too", async () => {
    const send = { category: "plumbing", problem: "Burst pipe", ...SIN_EL_FIL, visitDate: futureDate(0), timeSlot: "morning" as const };
    await expect((await callerFor(desk)).emergency.create({ ...send, technicianId: karim.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { requestId } = await (await callerFor(desk)).emergency.create({ ...send, technicianId: hassan.id });
    expect((await db.select().from(serviceRequests).where(eq(serviceRequests.id, requestId)))[0].district).toBe("metn");
    expect(await (await callerFor(desk)).emergency.districtOf(JOUNIEH)).toEqual({ district: "keserwan" });
  });

  it("are changed by admins only, at least one", async () => {
    const a = await callerFor(admin);
    await a.tech.setDistricts({ technicianId: karim.id, districts: ["metn", "keserwan"] });
    expect((await (await callerFor(desk)).tech.list()).find((x) => x.id === karim.id)?.districts).toEqual(["metn", "keserwan"]);
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "technician_districts_set"))).toHaveLength(1);
    await expect(a.tech.setDistricts({ technicianId: karim.id, districts: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect((await callerFor(desk)).tech.setDistricts({ technicianId: karim.id, districts: ["beirut"] })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("are asked on the application and given to the account when hired", async () => {
    const pub = await callerFor();
    const application = {
      name: "Rami Saad",
      phone: "+961 70 555 666",
      email: "rami@example.com",
      trade: "plumbing",
      experience: "5-10" as const,
      hasTools: true,
      workMode: "independent" as const,
      transport: "car" as const,
      photoKey: photoKey(),
      documents: { idDocument: true, criminalRecord: true, proofOfAddress: true, vehicleRegistration: true },
      consent: true as const,
    };
    await expect(pub.join.submit({ ...application, districts: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { id } = await pub.join.submit({ ...application, districts: ["metn", "beirut"] });
    expect((await db.select().from(technicianApplications).where(eq(technicianApplications.id, id)))[0].districts).toEqual(["beirut", "metn"]);

    await makeUser("rami@example.com", "Rami Saad");
    await (await callerFor(admin)).join.hire({ id });
    const [hired] = await db.select().from(users).where(eq(users.email, "rami@example.com"));
    expect(hired).toMatchObject({ role: "technician", districts: ["beirut", "metn"] });
  });
});
