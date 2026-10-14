// The workmanship guarantee ("report a problem") and customers managing their account.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { requestEvents, requestMedia, serviceRequests, users, type User } from "@db/schema";
import type { Email } from "./lib/email";
import { WORKMANSHIP_GUARANTEE_DAYS as DAYS } from "@contracts/legal";
import {
  SPECIALIST_EMAIL,
  BEIRUT_PIN,
  callerFor,
  createTestDb,
  deletedMedia,
  futureDate,
  makeTechnician,
  makeUser,
  makeSpecialist,
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
  admin = await makeSpecialist();
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
  await s.specialist.startReview({ id });
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
    expect(days).toBeGreaterThan(DAYS - 0.1);
    expect(days).toBeLessThanOrEqual(DAYS);
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
    expect(state.sent.find((m) => m.to.includes(SPECIALIST_EMAIL))?.subject).toContain(`Guarantee claim #${claim} on job #${done}`);

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
      .set({ createdAt: new Date(Date.now() - (DAYS + 1) * 86_400_000) })
      .where(and(eq(requestEvents.requestId, done), eq(requestEvents.status, "completed")));
    await expect((await callerFor(customer)).requests.reportProblem(problem(done))).rejects.toMatchObject({
      message: `The ${DAYS}-day guarantee for this job has ended`,
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
    await s.specialist.startReview({ id: claim });
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
    await s.specialist.startReview({ id });
    await expect(s.specialist.acceptGuarantee({ id })).rejects.toMatchObject({ message: "Only guarantee visits can be free" });
  });
});

describe("ratings", () => {
  it("lets the customer rate a completed job once, and shows the technician's average", async () => {
    const c = await callerFor(customer);
    const s = await callerFor(admin);
    const notDone = await job(customer, "scheduled");
    await rejected(c.reviews.submit({ requestId: notDone, rating: 5 }));

    const first = await job(customer, "completed");
    await rejected((await callerFor(await makeUser("stranger@example.com"))).reviews.submit({ requestId: first, rating: 1 }), "NOT_FOUND");
    await rejected(c.reviews.submit({ requestId: first, rating: 6 }));
    await c.reviews.submit({ requestId: first, rating: 5, comment: "Quick and tidy" });
    await expect(c.reviews.submit({ requestId: first, rating: 1 })).rejects.toMatchObject({ message: "You already rated this job" });

    const second = await job(customer, "completed");
    await c.reviews.submit({ requestId: second, rating: 4 });

    const { review, technician } = await c.requests.get({ id: first });
    expect(review).toMatchObject({ rating: 5, comment: "Quick and tidy", technicianId: tech.id });
    expect(technician?.rating.count).toBeGreaterThanOrEqual(2);
    expect(technician?.rating.average).toBeGreaterThan(4);
    expect((await s.specialist.detail({ id: second })).review).toMatchObject({ rating: 4 });
    const profile = (await s.tech.list()).find((x) => x.id === tech.id);
    expect(profile?.rating.count).toBe(technician?.rating.count);
  });

  it("keeps the stars but erases the comment when the customer deletes their account", async () => {
    const leaving = await makeUser("rated-and-left@example.com");
    const done = await job(leaving, "completed");
    await (await callerFor(leaving)).reviews.submit({ requestId: done, rating: 3, comment: "My name is in here" });
    await (await callerFor(leaving)).auth.deleteAccount();
    expect((await (await callerFor(admin)).specialist.detail({ id: done })).review).toMatchObject({ rating: 3, comment: null });
  });

  it("erases the name and phone of their emergencies when the customer deletes their account", async () => {
    const leaving = await makeUser("emergency-and-left@example.com");
    const { id } = await (await callerFor(leaving)).emergency.report({
      category: "plumbing",
      problem: "leak",
      name: "Rami",
      phone: "+1 202 555 0123",
    });
    await (await callerFor(leaving)).auth.deleteAccount();
    const entry = (await (await callerFor(admin)).emergency.list()).find((e) => e.id === id);
    expect(entry).toMatchObject({ category: "plumbing", problem: "leak", name: null, phone: null });
  });
});

describe("sending a technician to an emergency", () => {
  const PIN = { lat: 51.5072, lng: -0.1276 };
  const today = () => new Intl.DateTimeFormat("en-CA").format(new Date());
  const dispatchInput = (id: number) => ({
    id,
    technicianId: tech.id,
    amount: "60",
    name: "Rami",
    phone: "+44 20 7946 0123",
    address: "221B Baker Street, London",
    ...PIN,
    visitDate: today(),
    timeSlot: "evening" as const,
  });

  it("turns a guest's emergency into a scheduled job for the technician, followed by phone", async () => {
    const { id } = await (await callerFor()).emergency.report({
      category: "plumbing",
      problem: "leak",
      name: "Rami",
      phone: "+44 20 7946 0123",
      ...PIN,
      address: "221B Baker Street, London",
    });
    state.sent.length = 0;
    const s = await callerFor(admin);
    const { requestId } = await s.emergency.dispatch(dispatchInput(id));

    const job = (await s.specialist.detail({ id: requestId })).request;
    expect(job).toMatchObject({
      status: "scheduled",
      emergency: true,
      userId: null,
      contactName: "Rami",
      technicianId: tech.id,
      quoteAmount: "60",
      category: "plumbing",
    });
    expect((await (await callerFor(tech)).tech.myJobs()).map((j) => j.id)).toContain(requestId);
    expect(state.sent.find((m) => m.to.includes("ali@example.com"))?.subject).toContain("Emergency job");
    const entry = (await s.emergency.list()).find((e) => e.id === id);
    expect(entry).toMatchObject({ requestId, technicianName: "Ali" });
    expect(entry?.handledAt).toBeInstanceOf(Date);
    // Once is enough.
    await rejected(s.emergency.dispatch(dispatchInput(id)));
  });

  it("puts a signed-in customer's emergency in their requests", async () => {
    const caller = await makeUser("emergency-account@example.com", "Lina");
    const { id } = await (await callerFor(caller)).emergency.report({ category: "electrical", problem: "no-power", name: "Rami", phone: "+44 20 7946 0123" });
    const { requestId } = await (await callerFor(admin)).emergency.dispatch(dispatchInput(id));
    expect((await (await callerFor(caller)).requests.mine()).map((r) => r.id)).toContain(requestId);
  });

  it("only lets staff send, to a real technician, with a pin, a phone and a price", async () => {
    const { id } = await (await callerFor()).emergency.report({ category: "locksmith", problem: "locked-out", name: "Rami", phone: "+44 20 7946 0123" });
    await rejected((await callerFor(customer)).emergency.dispatch(dispatchInput(id)), "FORBIDDEN");
    const s = await callerFor(admin);
    await rejected(s.emergency.dispatch({ ...dispatchInput(id), technicianId: customer.id }));
    await rejected(s.emergency.dispatch({ ...dispatchInput(id), lat: 0, lng: 0 }));
    await rejected(s.emergency.dispatch({ ...dispatchInput(id), phone: "123" }));
    await rejected(s.emergency.dispatch({ ...dispatchInput(id), amount: "a lot" }));
  });
});

describe("the Emergency button", () => {
  it("logs a call for the team and emails the specialists", async () => {
    const visitor = await callerFor();
    await visitor.emergency.report({ category: "plumbing", problem: "leak", name: "Rami", phone: "+44 20 7946 0123" });
    const mail = state.sent.find((m) => m.to.includes(SPECIALIST_EMAIL));
    expect(mail?.subject).toContain("Water leaking or flooding");
    const list = await (await callerFor(admin)).emergency.list();
    expect(list[0]).toMatchObject({ category: "plumbing", problem: "leak", kind: "call", name: "Rami", phone: "+44 20 7946 0123", handledAt: null });
  });

  it("needs a name, a valid phone and a known emergency", async () => {
    const visitor = await callerFor();
    await rejected(visitor.emergency.report({ category: "plumbing", problem: "leak", name: "", phone: "+44 20 7946 0123" }));
    await rejected(visitor.emergency.report({ category: "plumbing", problem: "leak", name: "Rami", phone: "123" }));
    await rejected(visitor.emergency.report({ category: "painting", problem: "other", name: "Rami", phone: "+44 20 7946 0123" }));
    await rejected(visitor.emergency.report({ category: "plumbing", problem: "nope", name: "Rami", phone: "+44 20 7946 0123" }));
    const { id } = await visitor.emergency.report({
      category: "electrical",
      problem: "sparks",
      name: "Rami",
      phone: "+1 202 555 0123",
    });
    expect(id).toBeGreaterThan(0);
  });

  it("is only listed and handled by staff, once", async () => {
    const { id } = await (await callerFor(customer)).emergency.report({ category: "locksmith", problem: "other", name: "Rami", phone: "+44 20 7946 0123" });
    await rejected((await callerFor(customer)).emergency.list(), "FORBIDDEN");
    await rejected((await callerFor(customer)).emergency.markHandled({ id }), "FORBIDDEN");
    const s = await callerFor(admin);
    await s.emergency.markHandled({ id });
    await rejected(s.emergency.markHandled({ id }), "NOT_FOUND");
    expect((await s.emergency.list()).find((e) => e.id === id)?.handledBy).toBe(admin.id);
  });

  it("is limited per connection", async () => {
    const visitor = await callerFor(undefined, { ip: "203.0.113.9" });
    for (let i = 0; i < 6; i++) await visitor.emergency.report({ category: "plumbing", problem: "other", name: "Rami", phone: "+44 20 7946 0123" });
    await rejected(visitor.emergency.report({ category: "plumbing", problem: "other", name: "Rami", phone: "+44 20 7946 0123" }), "TOO_MANY_REQUESTS");
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
    // Their sign-in can stay valid for up to an hour: it must not bring the account back.
    const { findOrCreateUser } = await import("./queries/users");
    expect(await findOrCreateUser({ authId: leaving.authId, email: "leaving@example.com", name: "Leaving Customer" })).toBeNull();
    expect(await db.select().from(users).where(eq(users.email, "leaving@example.com"))).toHaveLength(0);
    await rejected((await callerFor(undefined)).requests.mine(), "UNAUTHORIZED");
    expect(state.deletedLogins).toContain(leaving.authId);

    const rows = await db.select().from(serviceRequests).where(eq(serviceRequests.userId, leaving.id));
    for (const r of rows) {
      expect(r).toMatchObject({ address: "(deleted)", phone: "(deleted)", notes: null, lat: null, lng: null });
    }
    expect(rows.find((r) => r.id === open)?.status).toBe("cancelled");
    expect(rows.find((r) => r.id === done)).toMatchObject({ status: "completed", quoteAmount: "40", category: "plumbing" });
    expect(await db.select().from(requestMedia).where(eq(requestMedia.requestId, open))).toHaveLength(0);
    expect(deletedMedia).toContain(photo);
    expect(state.sent.find((m) => m.to.includes(SPECIALIST_EMAIL))?.subject).toContain(`Request #${open} cancelled`);
  });

  it("is only for customers", async () => {
    await rejected((await callerFor(tech)).auth.deleteAccount(), "FORBIDDEN");
    await rejected((await callerFor(admin)).auth.deleteAccount(), "FORBIDDEN");
  });
});
