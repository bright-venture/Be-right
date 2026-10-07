// Who gets an email at each step of a job, and what it says. Emails are captured, not sent.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { technicianLocations, type User } from "@db/schema";
import type { Email } from "./lib/email";
import { WORKMANSHIP_GUARANTEE_DAYS as DAYS } from "@contracts/legal";
import {
  ADMIN_EMAIL,
  BEIRUT_PIN,
  callerFor,
  addJobPhoto,
  createTestDb,
  documentKeys,
  futureDate,
  makeTechnician,
  makeUser,
  type TestDb,
} from "./test/harness";

const state = vi.hoisted(() => ({ db: undefined as unknown, sent: [] as Email[] }));
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

let db: TestDb;
let admin: User, customer: User, ali: User, hassan: User;

beforeAll(async () => {
  db = await createTestDb();
  state.db = db;
  admin = await makeUser(ADMIN_EMAIL);
  customer = await makeUser("rami@example.com", "Rami");
  ali = await makeTechnician("ali@example.com", "Ali");
  hassan = await makeTechnician("hassan@example.com", "Hassan");
}, 60_000);

beforeEach(() => {
  state.sent.length = 0;
});

/** The one email sent to `to` since the last check (fails if there isn't exactly one). */
function emailTo(to: string) {
  const mails = state.sent.filter((m) => m.to.includes(to));
  expect(mails, `emails to ${to}`).toHaveLength(1);
  return mails[0];
}

const booking = {
  category: "plumbing",
  answers: { problem: "fixture" },
  preferredDate: futureDate(),
  timeSlot: "morning" as const,
  area: "<b>Hamra</b>",
  address: "Street 1",
  phone: "+961 70 000 000",
  media: [],
  ...BEIRUT_PIN,
};

describe("notification emails", () => {
  let id: number;

  it("tells specialists about a new request, safely escaped", async () => {
    ({ id } = await (await callerFor(customer)).requests.create(booking));
    const mail = emailTo(ADMIN_EMAIL);
    expect(mail.subject).toContain(`New request #${id}`);
    expect(mail.subject).toContain("طلب جديد");
    expect(mail.html).toContain("&lt;b&gt;Hamra&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>Hamra</b>");
    expect(mail.html).toContain("https://be-rightbright.com/dashboard");
    expect(state.sent.every((m) => !m.to.includes("rami@example.com"))).toBe(true);
  });

  it("sends the customer the price, and says when it changes", async () => {
    const s = await callerFor(admin);
    await s.specialist.startReview({ id, urgency: "normal" });
    expect(state.sent).toHaveLength(0);

    await s.specialist.sendQuote({ id, amount: "45", note: "Replace the valve" });
    let mail = emailTo("rami@example.com");
    expect(mail.subject).toContain("is ready");
    expect(mail.text).toContain("$45");
    expect(mail.text).toContain("Replace the valve");

    state.sent.length = 0;
    await s.specialist.sendQuote({ id, amount: "55" });
    mail = emailTo("rami@example.com");
    expect(mail.subject).toContain("Updated price");
    expect(mail.text).toContain("$55");
  });

  it("tells specialists when the customer approves", async () => {
    await (await callerFor(customer)).requests.approveQuote({ id, amount: "55" });
    expect(emailTo(ADMIN_EMAIL).subject).toContain("assign a technician");
  });

  it("tells technicians about new and reassigned jobs, and drops the old position", async () => {
    const s = await callerFor(admin);
    await s.tech.assign({ requestId: id, technicianId: ali.id });
    expect(emailTo("ali@example.com").subject).toContain(`New job #${id}`);

    // Ali shares his position on the way, then the job moves to Hassan.
    await s.specialist.setStatus({ id, status: "scheduled" });
    await (await callerFor(ali)).tech.reportLocation({ requestId: id, lat: 33.89, lng: 35.5 });
    state.sent.length = 0;
    await s.tech.assign({ requestId: id, technicianId: hassan.id });
    expect(emailTo("hassan@example.com").subject).toContain(`New job #${id}`);
    expect(emailTo("ali@example.com").subject).toContain("reassigned");
    expect(await db.select().from(technicianLocations).where(eq(technicianLocations.requestId, id))).toHaveLength(0);
    expect((await (await callerFor(customer)).requests.get({ id })).location).toBeNull();

    // Re-assigning the same technician changes nothing and sends nothing.
    state.sent.length = 0;
    await s.tech.assign({ requestId: id, technicianId: hassan.id });
    expect(state.sent).toHaveLength(0);
  });

  it("confirms the visit to the customer and the technician", async () => {
    const s = await callerFor(admin);
    const other = await (await callerFor(customer)).requests.create(booking);
    await s.specialist.startReview({ id: other.id, urgency: "normal" });
    await s.specialist.sendQuote({ id: other.id, amount: "30" });
    await (await callerFor(customer)).requests.approveQuote({ id: other.id, amount: "30" });
    await s.tech.assign({ requestId: other.id, technicianId: hassan.id });
    state.sent.length = 0;

    await s.specialist.setStatus({ id: other.id, status: "scheduled" });
    expect(emailTo("rami@example.com").text).toContain("Your technician: Hassan.");
    expect(emailTo("hassan@example.com").subject).toContain("scheduled");
  });

  it("tells the customer the job is done, with the guarantee", async () => {
    const h = await callerFor(hassan);
    await addJobPhoto(h, id, "before");
    await h.tech.fieldEvent({ requestId: id, action: "start" });
    expect(state.sent).toHaveLength(0);
    await addJobPhoto(h, id, "after");
    await h.tech.fieldEvent({ requestId: id, action: "complete" });
    expect(emailTo("rami@example.com").text).toContain(`within ${DAYS} days`);
  });

  it("handles cancellations from both sides", async () => {
    const c = await callerFor(customer);
    const s = await callerFor(admin);

    const early = await c.requests.create(booking);
    state.sent.length = 0;
    await c.requests.cancel({ id: early.id });
    expect(emailTo(ADMIN_EMAIL).subject).toContain("cancelled by the customer");

    const late = await c.requests.create(booking);
    await s.specialist.startReview({ id: late.id, urgency: "normal" });
    await s.specialist.sendQuote({ id: late.id, amount: "20" });
    await c.requests.approveQuote({ id: late.id, amount: "20" });
    await s.tech.assign({ requestId: late.id, technicianId: ali.id });
    await s.specialist.setStatus({ id: late.id, status: "scheduled" });
    state.sent.length = 0;

    await c.requests.requestCancel({ id: late.id, reason: "Fixed it myself" });
    expect(emailTo(ADMIN_EMAIL).text).toContain("Fixed it myself");
    state.sent.length = 0;
    await c.requests.requestCancel({ id: late.id }); // asking again sends nothing new
    expect(state.sent).toHaveLength(0);

    await s.specialist.cancel({ id: late.id, reason: "Customer asked" });
    expect(emailTo("rami@example.com").subject).toContain("was cancelled");
    expect(emailTo("ali@example.com").text).toContain("No need to go");
  });

  it("tells specialists about technician applications", async () => {
    await (await callerFor()).join.submit({
      name: "Samir",
      phone: "+961 71 222 333",
      email: "samir@example.com",
      trade: "electrical",
      area: "Jounieh",
      experience: "3-5",
      availability: "full_time",
      hasTools: true,
      hasTransport: false,
      notes: "Generators and inverters",
      ...documentKeys(),
      consent: true,
    });
    expect(emailTo(ADMIN_EMAIL).subject).toContain("Samir");
  });

  it("never fails the action when an email can't be sent", async () => {
    const email = await import("./lib/email");
    const spy = vi.spyOn(email, "sendEmail").mockRejectedValueOnce(new Error("Resend is down"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect((await callerFor(customer)).requests.create(booking)).resolves.toMatchObject({ id: expect.any(Number) });
    expect(quiet).toHaveBeenCalledWith("[notify] requestSubmitted failed", expect.any(Error));
    spy.mockRestore();
    quiet.mockRestore();
  });
});
