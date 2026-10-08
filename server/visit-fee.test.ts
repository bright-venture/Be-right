// The visit fee (minimum charge): fixed at booking, charged on its own only when a specialist
// closes a job where no repair happened, and never on guarantee visits.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { serviceRequests, type User } from "@db/schema";
import { VISIT_FEE_USD } from "@contracts/workflow";
import { BEIRUT_PIN, callerFor, createTestDb, futureDate, makeTechnician, makeUser, type TestDb, makeSpecialist } from "./test/harness";

const state = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("./queries/connection", () => ({ getDb: () => state.db }));
vi.mock("./lib/env", () => ({
  env: {
    isProduction: false,
    databaseUrl: "",
    supabaseUrl: "",
    supabaseServiceRoleKey: "",
    storageBucket: "test",
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
let admin: User;
let customer: User;
let tech: User;

/** A booked request taken all the way to a scheduled visit. */
async function scheduledJob() {
  const c = await callerFor(customer);
  const s = await callerFor(admin);
  const { id } = await c.requests.create(booking);
  await s.specialist.startReview({ id, urgency: "normal" });
  await s.specialist.sendQuote({ id, amount: "45" });
  await c.requests.approveQuote({ id, amount: "45" });
  await s.tech.assign({ requestId: id, technicianId: tech.id });
  await s.specialist.setStatus({ id, status: "scheduled" });
  return id;
}

const row = async (id: number) => (await db.select().from(serviceRequests).where(eq(serviceRequests.id, id)))[0]!;

beforeAll(async () => {
  db = await createTestDb();
  state.db = db;
  admin = await makeSpecialist();
  customer = await makeUser("rana@example.com", "Rana");
  tech = await makeTechnician("karim.tech@example.com", "Karim");
}, 60_000);

describe("visit fee", () => {
  it("is fixed on each request when it's booked", async () => {
    const { id } = await (await callerFor(customer)).requests.create(booking);
    expect((await row(id)).visitFee).toBe(String(VISIT_FEE_USD));
  });

  it("lets the technician report a visit without a repair, but only a specialist charges the fee", async () => {
    const id = await scheduledJob();
    const t = await callerFor(tech);
    await t.tech.reportVisit({ requestId: id, reason: "no_access", note: "Rang twice, nobody answered" });
    const events = await (await callerFor(admin)).specialist.detail({ id });
    expect(events.events.some((e) => e.status === "visit_report" && e.note?.includes("nobody answered"))).toBe(true);

    // Not the technician, not the customer.
    await expect(t.specialist.closeWithVisitFee({ id, reason: "no_access" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      (await callerFor(customer)).specialist.closeWithVisitFee({ id, reason: "no_access" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await (await callerFor(admin)).specialist.closeWithVisitFee({ id, reason: "no_access" });
    const closed = await row(id);
    expect(closed.status).toBe("cancelled");
    expect(closed.visitFeeReason).toBe("no_access");

    // The customer sees why, and the amount fixed at booking.
    const seen = await (await callerFor(customer)).requests.get({ id });
    expect(seen.request.visitFee).toBe(String(VISIT_FEE_USD));
    expect(seen.request.visitFeeReason).toBe("no_access");
  });

  it("applies only once the visit is scheduled or under way", async () => {
    const { id } = await (await callerFor(customer)).requests.create(booking);
    await expect(
      (await callerFor(admin)).specialist.closeWithVisitFee({ id, reason: "no_work" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("is never charged on a guarantee visit", async () => {
    const id = await scheduledJob();
    const original = await scheduledJob();
    await db.update(serviceRequests).set({ guaranteeFor: original }).where(eq(serviceRequests.id, id));
    await expect(
      (await callerFor(admin)).specialist.closeWithVisitFee({ id, reason: "no_work" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await row(id)).status).toBe("scheduled");
  });

  it("isn't charged on requests booked before visit fees existed", async () => {
    const id = await scheduledJob();
    await db.update(serviceRequests).set({ visitFee: null }).where(eq(serviceRequests.id, id));
    await expect(
      (await callerFor(admin)).specialist.closeWithVisitFee({ id, reason: "late_cancel" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("visit reports", () => {
  it("are limited to a few per job, since each one emails every specialist", async () => {
    const id = await scheduledJob();
    const t = await callerFor(tech);
    for (let i = 0; i < 3; i++) await t.tech.reportVisit({ requestId: id, reason: "no_access" });
    await expect(t.tech.reportVisit({ requestId: id, reason: "no_access" })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });
});
