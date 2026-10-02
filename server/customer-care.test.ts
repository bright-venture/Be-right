// The workmanship guarantee ("report a problem") and customers managing their account.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { requestEvents, requestMedia, serviceRequests, users, type User } from "@db/schema";
import type { Email } from "./lib/email";
import {
  ADMIN_EMAIL,
  BEIRUT_PIN,
  callerFor,
  createTestDb,
  deletedMedia,
  futureDate,
  makeTechnician,
  makeUser,
  type TestDb,
} from "./test/harness";

const state = vi.hoisted(() => ({ db: undefined as unknown, sent: [] as Email[], deletedLogins: [] as string[] }));
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
    specialistEmails: ["specialist@example.com"],
  },
}));
vi.mock("./lib/storage", async (importOriginal) =>
  (await import("./test/harness")).storageStub(importOriginal),
);
vi.mock("./lib/email", () => ({
  sendEmail: async (email: Email) => {
    state.sent.push(email);
  },
}));
vi.mock("./lib/accounts", () => ({
  deleteAuthUser: async (authId: string) => {
    state.deletedLogins.push(authId);
  },
}));

let db: TestDb;
let admin: User, customer: User, tech: User;

beforeAll(async () => {
  db = await createTestDb();
  state.db = db;
  admin = await makeUser(ADMIN_EMAIL);
  customer = await makeUser("nour@example.com", "Nour");
  tech = await makeTechnician("ali@example.com", "Ali");
}, 60_000);

beforeEach(() => {
  state.sent.length = 0;
});

const rejected = (p: Promise<unknown>, code = "BAD_REQUEST") => expect(p).rejects.toMatchObject({ code });

const booking = {
  category: "plumbing",
  answers: { problem: "fixture" },
  preferredDate: futureDate(),
  timeSlot: "morning" as const,
  area: "Achrafieh",
  address: "Building 4, 2nd floor",
  phone: "+961 70 111 222",
  notes: "Ring twice",
  media: [],
  ...BEIRUT_PIN,
};

/** Books a request for `who` and walks it to the given point. */
async function job(who: User, until: "submitted" | "approved" | "scheduled" | "completed") {
  const c = await callerFor(who);
  const s = await callerFor(admin);
  const { id } = await c.requests.create(booking);
  if (until === "submitted") return id;
  await s.specialist.startReview({ id, urgency: "normal" });
  await s.specialist.sendQuote({ id, amount: "40" });
  await c.requests.approveQuote({ id, amount: "40" });
  if (until === "approved") return id;
  await s.tech.assign({ requestId: id, technicianId: tech.id });
  await s.specialist.setStatus({ id, status: "scheduled" });
  if (until === "scheduled") return id;
  await s.specialist.setStatus({ id, status: "in_progress" });
  await s.specialist.setStatus({ id, status: "completed" });
  return id;
}

const problem = (id: number) => ({
  id,
  description: "The leak under the sink is back since yesterday.",
  preferredDate: futureDate(3),
  timeSlot: "afternoon" as const,
  media: [],
});

describe("report a problem (workmanship guarantee)", () => {
  it("only for completed jobs, and shows until when they're covered", async () => {
    const c = await callerFor(customer);
    const notDone = await job(customer, "scheduled");
    await rejected(c.requests.reportProblem(problem(notDone)));
    expect((await c.requests.get({ id: notDone })).guarantee).toBeNull();

    const done = await job(customer, "completed");
    const { guarantee } = await c.requests.get({ id: done });
    expect(guarantee?.openClaimId).toBeNull();
    const days = (guarantee!.endsAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
  });

  it("opens a linked visit at the same address, once at a time", async () => {
    const c = await callerFor(customer);
    const done = await job(customer, "completed");
    await rejected((await callerFor(await makeUser("other@example.com"))).requests.reportProblem(problem(done)), "NOT_FOUND");

    state.sent.length = 0;
    const { id: claim } = await c.requests.reportProblem(problem(done));
    const { request } = await c.requests.get({ id: claim });
    expect(request).toMatchObject({
      guaranteeFor: done,
      status: "submitted",
      address: "Building 4, 2nd floor",
      phone: "+961 70 111 222",
      notes: "The leak under the sink is back since yesterday.",
      category: "plumbing",
    });
    expect(state.sent.find((m) => m.to.includes(ADMIN_EMAIL))?.subject).toContain(`Guarantee claim #${claim} on job #${done}`);

    // While that claim is open, the job can't be reported again.
    await expect(c.requests.reportProblem(problem(done))).rejects.toMatchObject({
      message: `You already reported this. Follow request #${claim}`,
    });
    expect((await c.requests.get({ id: done })).guarantee?.openClaimId).toBe(claim);
  });

  it("ends after the guarantee period", async () => {
    const done = await job(customer, "completed");
    await db
      .update(requestEvents)
      .set({ createdAt: new Date(Date.now() - 31 * 86_400_000) })
      .where(and(eq(requestEvents.requestId, done), eq(requestEvents.status, "completed")));
    await expect((await callerFor(customer)).requests.reportProblem(problem(done))).rejects.toMatchObject({
      message: "The 30-day guarantee for this job has ended",
    });
  });

  it("lets the specialist confirm a free return visit, then works like any job", async () => {
    const s = await callerFor(admin);
    const c = await callerFor(customer);
    const done = await job(customer, "completed");
    const { id: claim } = await c.requests.reportProblem(problem(done));

    const detail = await s.specialist.detail({ id: claim });
    expect(detail.guarantee).toMatchObject({ originalId: done, technicianId: tech.id, technicianName: "Ali" });

    await rejected(s.specialist.acceptGuarantee({ id: claim })); // must be reviewed first
    await s.specialist.startReview({ id: claim, urgency: "priority" });
    await rejected(c.specialist.acceptGuarantee({ id: claim }), "FORBIDDEN");
    state.sent.length = 0;
    await s.specialist.acceptGuarantee({ id: claim });
    expect((await c.requests.get({ id: claim })).request).toMatchObject({ status: "approved", quoteAmount: "0" });
    expect(state.sent.find((m) => m.to.includes("nour@example.com"))?.subject).toContain("We'll come back for free");

    await s.tech.assign({ requestId: claim, technicianId: tech.id });
    await s.specialist.setStatus({ id: claim, status: "scheduled" });
  });

  it("never makes an ordinary request free", async () => {
    const s = await callerFor(admin);
    const id = await job(customer, "submitted");
    await s.specialist.startReview({ id, urgency: "normal" });
    await expect(s.specialist.acceptGuarantee({ id })).rejects.toMatchObject({ message: "Only guarantee visits can be free" });
  });
});

describe("my account", () => {
  it("updates name and phone, with a valid phone only", async () => {
    const c = await callerFor(customer);
    await rejected(c.auth.updateProfile({ name: "Nour Haddad", phone: "3432" }));
    await c.auth.updateProfile({ name: "Nour Haddad", phone: "+961 3 123 456" });
    const [row] = await db.select().from(users).where(eq(users.id, customer.id));
    expect(row).toMatchObject({ name: "Nour Haddad", phone: "+961 3 123 456" });
  });

  it("can't be deleted while a visit is booked", async () => {
    const leaving = await makeUser("leaving-later@example.com");
    const booked = await job(leaving, "scheduled");
    await expect((await callerFor(leaving)).auth.deleteAccount()).rejects.toMatchObject({
      message: `Your visit #${booked} is booked. Ask to cancel it first, or wait until the job is done.`,
    });
  });

  it("erases personal details, cancels open requests and keeps the job records", async () => {
    const leaving = await makeUser("leaving@example.com", "Leaving Customer");
    const c = await callerFor(leaving);
    const photo = `requests/${leaving.authId}/photo.jpg`;
    const { id: open } = await c.requests.create({
      ...booking,
      media: [{ key: photo, fileName: "photo.jpg", size: 10, contentType: "image/jpeg" }],
    });
    const done = await job(leaving, "completed");

    state.sent.length = 0;
    await c.auth.deleteAccount();

    const [account] = await db.select().from(users).where(eq(users.id, leaving.id));
    expect(account).toMatchObject({ name: null, email: null, phone: null });
    expect(account.deletedAt).toBeInstanceOf(Date);
    expect(account.authId).not.toBe(leaving.authId);
    expect(state.deletedLogins).toContain(leaving.authId);

    const rows = await db.select().from(serviceRequests).where(eq(serviceRequests.userId, leaving.id));
    for (const r of rows) {
      expect(r).toMatchObject({ address: "(deleted)", phone: "(deleted)", notes: null, lat: null, lng: null });
    }
    expect(rows.find((r) => r.id === open)?.status).toBe("cancelled");
    expect(rows.find((r) => r.id === done)).toMatchObject({ status: "completed", quoteAmount: "40", category: "plumbing" });
    expect(await db.select().from(requestMedia).where(eq(requestMedia.requestId, open))).toHaveLength(0);
    expect(deletedMedia).toContain(photo);
    expect(state.sent.find((m) => m.to.includes(ADMIN_EMAIL))?.subject).toContain(`Request #${open} cancelled`);
  });

  it("is only for customers", async () => {
    await rejected((await callerFor(tech)).auth.deleteAccount(), "FORBIDDEN");
    await rejected((await callerFor(admin)).auth.deleteAccount(), "FORBIDDEN");
  });
});
