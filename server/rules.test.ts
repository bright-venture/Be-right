// Business rules and input validation that the happy-path workflow test doesn't cover.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { User } from "@db/schema";
import { BEIRUT_PIN, addJobPhoto, callerFor, createTestDb, futureDate, makeAdmin, makeTechnician, makeUser, makeSpecialist } from "./test/harness";

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

const base = {
  category: "plumbing",
  answers: { problem: "fixture" },
  preferredDate: futureDate(),
  timeSlot: "morning" as const,
  area: "Hamra",
  address: "Street 1",
  phone: "+961 70 000 000",
  media: [],
  ...BEIRUT_PIN,
};

let admin: User, customer: User, tech: User;

beforeAll(async () => {
  state.db = await createTestDb();
  admin = await makeSpecialist();
  customer = await makeUser("customer@example.com");
  tech = await makeTechnician("tech@example.com");
}, 60_000);

/** Books a request and walks it to "approved" (quote accepted). */
async function approvedRequest() {
  const c = await callerFor(customer);
  const s = await callerFor(admin);
  const { id } = await c.requests.create(base);
  await s.specialist.startReview({ id });
  await s.specialist.sendQuote({ id, amount: "30" });
  await c.requests.approveQuote({ id, amount: "30" });
  return id;
}

const rejected = (p: Promise<unknown>, code = "BAD_REQUEST") =>
  expect(p).rejects.toMatchObject({ code });

describe("booking validation", () => {
  it("requires a real date from today onwards", async () => {
    const c = await callerFor(customer);
    await rejected(c.requests.create({ ...base, preferredDate: "banana" }));
    await rejected(c.requests.create({ ...base, preferredDate: "2020-01-01" }));
    await rejected(c.requests.create({ ...base, preferredDate: "2026-02-30" }));
  });

  it("accepts at most two videos per booking", async () => {
    const c = await callerFor(customer);
    const file = (n: number, contentType: string) => ({
      key: `requests/${customer.authId}/${n}-file`,
      fileName: `file-${n}`,
      size: 1000,
      contentType,
    });
    await rejected(c.requests.create({ ...base, media: [1, 2, 3].map((n) => file(n, "video/mp4")) }));
    await expect(
      c.requests.create({ ...base, media: [file(4, "video/mp4"), file(5, "video/quicktime"), file(6, "image/jpeg")] }),
    ).resolves.toMatchObject({ id: expect.any(Number) });
  });

  it("requires a full phone number with its country code", async () => {
    const c = await callerFor(customer);
    await rejected(c.requests.create({ ...base, phone: "3432" }));
    await rejected(c.requests.create({ ...base, phone: "call me maybe" }));
    // Without the country code it can't be called or opened in WhatsApp from another country.
    await rejected(c.requests.create({ ...base, phone: "03 123 456" }));
    await expect(c.requests.create({ ...base, phone: "+33 6 12 34 56 78" })).resolves.toMatchObject({ id: expect.any(Number) });
    await expect(c.requests.create({ ...base, phone: "0044 20 7946 0958" })).resolves.toMatchObject({ id: expect.any(Number) });
  });

  it("only accepts answers to the category's own questions", async () => {
    const c = await callerFor(customer);
    await rejected(c.requests.create({ ...base, answers: { problem: "fixture", junk: "y" } }));
    await rejected(c.requests.create({ ...base, answers: { problem: "not-an-option" } }));
    await rejected(c.requests.create({ ...base, answers: {} }));
    // A follow-up question only counts when its trigger answer was given.
    await rejected(c.requests.create({ ...base, answers: { problem: "fixture", flow: "large" } }));
  });

  it("only accepts offered time slots", async () => {
    await rejected((await callerFor(customer)).requests.create({ ...base, timeSlot: "3am" as never }));
  });
});

describe("specialist rules", () => {
  it("starts the review before quoting", async () => {
    const { id } = await (await callerFor(customer)).requests.create(base);
    await rejected((await callerFor(admin)).specialist.sendQuote({ id, amount: "20" }));
  });

  it("requires a numeric quote amount", async () => {
    const { id } = await (await callerFor(customer)).requests.create(base);
    const s = await callerFor(admin);
    await s.specialist.startReview({ id });
    await rejected(s.specialist.sendQuote({ id, amount: "call me" }));
    await s.specialist.sendQuote({ id, amount: "45.50" });
  });

  it("assigns technicians only after the customer approves", async () => {
    const s = await callerFor(admin);
    const { id } = await (await callerFor(customer)).requests.create(base);
    await rejected(s.tech.assign({ requestId: id, technicianId: tech.id }));
    const approved = await approvedRequest();
    await s.tech.assign({ requestId: approved, technicianId: tech.id });
  });

  it("never assigns to a cancelled request", async () => {
    const c = await callerFor(customer);
    const { id } = await c.requests.create(base);
    await c.requests.cancel({ id });
    await rejected((await callerFor(admin)).tech.assign({ requestId: id, technicianId: tech.id }));
  });

  it("needs a technician before scheduling", async () => {
    const id = await approvedRequest();
    const s = await callerFor(admin);
    await expect(s.specialist.setStatus({ id, status: "scheduled" })).rejects.toMatchObject({
      message: "Assign a technician before scheduling",
    });
    await s.tech.assign({ requestId: id, technicianId: tech.id });
    await s.specialist.setStatus({ id, status: "scheduled" });
  });

  it("prepares the job for the technician, until the request is closed", async () => {
    const s = await callerFor(admin);
    const id = await approvedRequest();
    await s.tech.assign({ requestId: id, technicianId: tech.id });
    await s.specialist.prepare({
      id,
      diagnosis: "Worn tap cartridge",
      tools: "Adjustable wrench",
      parts: "1/2 inch angle valve",
      instructions: "Shut the main valve under the sink first",
    });
    const job = (await (await callerFor(tech)).tech.myJobs()).find((j) => j.id === id);
    expect(job).toMatchObject({ prepParts: "1/2 inch angle valve", prepTools: "Adjustable wrench" });
    expect(job?.preparedAt).toBeInstanceOf(Date);
    await rejected((await callerFor(tech)).specialist.prepare({ id, diagnosis: "", tools: "", parts: "", instructions: "" }), "FORBIDDEN");

    const c = await callerFor(customer);
    const { id: cancelled } = await c.requests.create(base);
    await c.requests.cancel({ id: cancelled });
    await rejected(s.specialist.prepare({ id: cancelled, diagnosis: "x", tools: "", parts: "", instructions: "" }));
  });

  it("shows technician profiles with their workload", async () => {
    const profile = (await (await callerFor(admin)).tech.list()).find((x) => x.id === tech.id);
    expect(profile).toMatchObject({ email: "tech@example.com", activeJobs: expect.any(Number), completedJobs: expect.any(Number) });
    expect(profile!.activeJobs).toBeGreaterThan(0);
  });
});

describe("customer rules", () => {
  it("can cancel until the visit is scheduled, not after", async () => {
    const s = await callerFor(admin);
    const c = await callerFor(customer);
    const id = await approvedRequest();
    await s.tech.assign({ requestId: id, technicianId: tech.id });
    await s.specialist.setStatus({ id, status: "scheduled" });
    await rejected(c.requests.cancel({ id }));

    const early = await approvedRequest();
    await c.requests.cancel({ id: early });
  });

  it("asks a specialist to cancel a scheduled visit", async () => {
    const s = await callerFor(admin);
    const c = await callerFor(customer);
    const notYet = await approvedRequest();
    await rejected(c.requests.requestCancel({ id: notYet })); // can still cancel directly

    const id = await scheduledRequest();
    await rejected((await callerFor(await makeUser("other@example.com"))).requests.requestCancel({ id }), "NOT_FOUND");
    await c.requests.requestCancel({ id, reason: "Fixed it myself" });
    await c.requests.requestCancel({ id, reason: "again" }); // asking twice changes nothing

    const { request, events } = await s.specialist.detail({ id });
    expect(request).toMatchObject({ status: "scheduled", cancelReason: "Fixed it myself" });
    expect(request.cancelRequestedAt).toBeInstanceOf(Date);
    expect(events.filter((e) => e.status === "cancel_requested")).toHaveLength(1);

    await s.specialist.cancel({ id, reason: "Customer asked to cancel: Fixed it myself" });
    expect((await c.requests.get({ id })).request.status).toBe("cancelled");
  });
});

/** Books, approves, assigns and schedules a request. */
async function scheduledRequest() {
  const s = await callerFor(admin);
  const id = await approvedRequest();
  await s.tech.assign({ requestId: id, technicianId: tech.id });
  await s.specialist.setStatus({ id, status: "scheduled" });
  return id;
}

describe("specialist corrections", () => {
  it("closes any open request with a reason, but not a closed one", async () => {
    const s = await callerFor(admin);
    const { id: fresh } = await (await callerFor(customer)).requests.create(base);
    await rejected(s.specialist.cancel({ id: fresh, reason: "" }));
    await s.specialist.cancel({ id: fresh, reason: "Outside our service area" });
    const { events } = await s.specialist.detail({ id: fresh });
    expect(events[0]).toMatchObject({ status: "cancelled", note: "Outside our service area" });
    await rejected(s.specialist.cancel({ id: fresh, reason: "Again" }));

    const inProgress = await scheduledRequest();
    await s.specialist.setStatus({ id: inProgress, status: "in_progress" });
    await s.specialist.cancel({ id: inProgress, reason: "Customer not home" });

    await rejected((await callerFor(customer)).specialist.cancel({ id: await approvedRequest(), reason: "Mine" }), "FORBIDDEN");
  });

  it("changes a quote until the customer approves, and never approves a price they didn't see", async () => {
    const s = await callerFor(admin);
    const c = await callerFor(customer);
    const { id } = await c.requests.create(base);
    await s.specialist.startReview({ id });
    await s.specialist.sendQuote({ id, amount: "30" });
    await s.specialist.sendQuote({ id, amount: "55", note: "Needs a new valve" });
    expect((await c.requests.get({ id })).request).toMatchObject({ quoteAmount: "55", quoteNote: "Needs a new valve" });

    await expect(c.requests.approveQuote({ id, amount: "30" })).rejects.toMatchObject({
      message: expect.stringContaining("$55"),
    });
    await c.requests.approveQuote({ id, amount: "55" });
    await rejected(s.specialist.sendQuote({ id, amount: "60" })); // too late once approved
  });
});

describe("role separation", () => {
  it("keeps specialists out of technician and customer areas", async () => {
    const s = await callerFor(admin);
    await rejected(s.tech.myJobs(), "FORBIDDEN");
    await rejected(s.requests.create(base), "FORBIDDEN");
    await rejected(s.requests.mine(), "FORBIDDEN");
    await rejected(s.storage.createUpload({ fileName: "a.jpg", size: 1, contentType: "image/jpeg" }), "FORBIDDEN");
  });

  it("keeps technicians out of the dashboard and customer areas", async () => {
    const t = await callerFor(tech);
    await rejected(t.specialist.queue(), "FORBIDDEN");
    await rejected(t.join.list(), "FORBIDDEN");
    await rejected(t.tech.assign({ requestId: 1, technicianId: tech.id }), "FORBIDDEN");
    await rejected(t.requests.create(base), "FORBIDDEN");
  });

  it("keeps customers out of staff areas", async () => {
    const c = await callerFor(customer);
    await rejected(c.specialist.queue(), "FORBIDDEN");
    await rejected(c.tech.myJobs(), "FORBIDDEN");
    await rejected(c.tech.list(), "FORBIDDEN");
  });
});

describe("technician accounts", () => {
  it("shows the customer's photos on the job card", async () => {
    const jobs = await (await callerFor(tech)).tech.myJobs();
    expect(jobs.length).toBeGreaterThan(0);
    expect(Array.isArray(jobs[0].media)).toBe(true);
  });

  it("can't be removed while they have an active job, then can (by an admin only)", async () => {
    const s = await callerFor(await makeAdmin("boss@example.com", "Boss"));
    await expect((await callerFor(admin)).tech.remove({ technicianId: tech.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await rejected(s.tech.remove({ technicianId: tech.id }));
    // Finish every active job, then removal works.
    const t = await callerFor(tech);
    for (const job of await t.tech.myJobs()) {
      if (job.status === "scheduled") {
        await addJobPhoto(t, job.id, "before");
        await t.tech.fieldEvent({ requestId: job.id, action: "start" });
      }
      if (["scheduled", "in_progress"].includes(job.status)) {
        await addJobPhoto(t, job.id, "after");
        await t.tech.fieldEvent({ requestId: job.id, action: "complete" });
      }
    }
    await s.tech.remove({ technicianId: tech.id });
    expect((await s.tech.list()).map((x) => x.id)).not.toContain(tech.id);
  });

  it("hands jobs waiting to be scheduled back to the specialist when removed", async () => {
    const s = await callerFor(admin);
    const leaving = await makeTechnician("leaving@example.com", "Leaving Tech");
    const waiting = await approvedRequest();
    await s.tech.assign({ requestId: waiting, technicianId: leaving.id });

    const boss = await callerFor(await makeAdmin("boss2@example.com", "Boss Two"));
    const { unassigned } = await boss.tech.remove({ technicianId: leaving.id });
    expect(unassigned).toEqual([waiting]);
    const { request, events } = await s.specialist.detail({ id: waiting });
    expect(request.technicianId).toBeNull();
    expect(events[0]).toMatchObject({ status: "unassigned", note: "Technician removed: Leaving Tech" });
    // It can't be scheduled until someone else is assigned.
    await expect(s.specialist.setStatus({ id: waiting, status: "scheduled" })).rejects.toMatchObject({
      message: "Assign a technician before scheduling",
    });
  });
});
