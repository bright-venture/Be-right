// Notifications go out after the answer: saving never waits for the email or push providers,
// and on Netlify the function is kept alive until they're sent.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import superjson from "superjson";
import type { User } from "@db/schema";
import type { Email } from "./lib/email";
import { withAfterResponse } from "./lib/afterResponse";
import { BEIRUT_PIN, callerFor, createTestDb, futureDate, makeSpecialist, makeUser, type TestDb } from "./test/harness";

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  sent: [] as Email[],
  /** Emails wait for this: the "provider" answers only when the test lets it. */
  gate: Promise.resolve(),
  fail: false,
}));
vi.mock("./queries/connection", () => ({ getDb: () => state.db }));
vi.mock("./lib/env", async () => ({ env: (await import("./test/env")).testEnv() }));
vi.mock("./lib/storage", async (importOriginal) =>
  (await import("./test/harness")).storageStub(importOriginal),
);
vi.mock("./lib/email", () => ({
  sendEmail: async (email: Email) => {
    await state.gate;
    if (state.fail) throw new Error("Resend is down");
    state.sent.push(email);
    return true;
  },
}));

/** A slow email provider, released by the test. */
function slowProvider() {
  let release = () => {};
  state.gate = new Promise<void>((resolve) => (release = resolve));
  return () => release();
}

describe("notifications after the answer", () => {
  let db: TestDb;
  let customer: User;
  const booking = {
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

  beforeAll(async () => {
    db = await createTestDb();
    state.db = db;
    customer = await makeUser("rami@example.com", "Rami");
    await makeSpecialist("maya@example.com", "Maya");
  }, 60_000);
  beforeEach(() => {
    state.sent.length = 0;
    state.gate = Promise.resolve();
    state.fail = false;
  });

  it("answer first, then send, in a request", async () => {
    const release = slowProvider();
    const pending: Promise<unknown>[] = [];
    const c = await callerFor(customer);
    const { id } = await withAfterResponse((work) => pending.push(work), () => c.requests.create(booking));
    // Saved and answered while the email provider still hasn't replied.
    expect(id).toEqual(expect.any(Number));
    expect(state.sent).toHaveLength(0);
    expect(pending).toHaveLength(1);

    release();
    await Promise.all(pending);
    expect(state.sent.map((m) => m.to)).toEqual([["maya@example.com"]]);
    expect(state.sent[0].subject).toContain(`New request #${id}`);
  });

  it("send before answering outside a request (scripts, tests), as before", async () => {
    await (await callerFor(customer)).requests.create(booking);
    expect(state.sent).toHaveLength(1);
  });

  it("never let a failed email break the answer", async () => {
    state.fail = true;
    const pending: Promise<unknown>[] = [];
    const c = await callerFor(customer);
    await expect(withAfterResponse((work) => pending.push(work), () => c.requests.create(booking))).resolves.toMatchObject({
      id: expect.any(Number),
    });
    await expect(Promise.all(pending)).resolves.toBeDefined();
    expect(state.sent).toHaveLength(0);
  });

  it("keep the Netlify function alive until they're sent", async () => {
    const { default: handler } = await import("./netlify");
    const release = slowProvider();
    const pending: Promise<unknown>[] = [];
    const res = await handler(
      new Request("https://be-rightbright.com/api/trpc/emergency.report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(superjson.serialize({ problem: "leak", lat: BEIRUT_PIN.lat, lng: BEIRUT_PIN.lng, phone: "+961 70 123 456" })),
      }),
      { waitUntil: (work) => void pending.push(work) },
    );
    expect(res.status).toBe(200);
    expect(state.sent).toHaveLength(0);
    expect(pending.length).toBeGreaterThan(0);

    release();
    await Promise.all(pending);
    expect(state.sent.map((m) => m.to)).toEqual([["maya@example.com"]]);
  });
});
