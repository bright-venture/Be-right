// Push notifications to the app: phones register for whoever is signed in, and each event
// reaches the right people's phones (Firebase is faked here: nothing leaves the test).
import { generateKeyPairSync } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { pushDevices, type User } from "@db/schema";
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

const state = vi.hoisted(() => ({ db: undefined as unknown, serviceAccount: "" }));
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
    get firebaseServiceAccount() {
      return state.serviceAccount;
    },
  },
}));
vi.mock("./lib/storage", async (importOriginal) =>
  (await import("./test/harness")).storageStub(importOriginal),
);
vi.mock("./lib/email", () => ({ sendEmail: async () => true }));

type Sent = { token: string; title: string; body: string; path: string; channel: string };
const sent: Sent[] = [];
/** Tokens Firebase says are gone (the app was removed from that phone). */
const gone = new Set<string>();

vi.stubGlobal("fetch", async (url: string, init: { body: string | URLSearchParams }) => {
  if (url === "https://oauth2.googleapis.com/token") {
    return new Response(JSON.stringify({ access_token: "test-access", expires_in: 3600 }), { status: 200 });
  }
  if (url.startsWith("https://fcm.googleapis.com/v1/projects/be-right-test/messages:send")) {
    const { message } = JSON.parse(String(init.body));
    if (gone.has(message.token)) {
      return new Response(JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 });
    }
    sent.push({
      token: message.token,
      title: message.notification.title,
      body: message.notification.body,
      path: message.data.path,
      channel: message.android.notification.channel_id,
    });
    return new Response("{}", { status: 200 });
  }
  throw new Error(`unexpected fetch ${url}`);
});

const TOKEN = (who: string) => `fcm-token-for-${who}-0123456789`;

describe("push notifications", () => {
  let db: TestDb;
  let owner: User, desk: User, customer: User, hassan: User;

  beforeAll(async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    state.serviceAccount = JSON.stringify({
      project_id: "be-right-test",
      client_email: "push@be-right-test.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    });
    db = await createTestDb();
    state.db = db;
    owner = await makeAdmin("owner@example.com");
    desk = await makeSpecialist("maya@example.com", "Maya", ["plumbing"]);
    customer = await makeUser("rami@example.com", "Rami");
    hassan = await makeTechnician("hassan@example.com", "Hassan");
    await (await callerFor(customer)).push.register({ token: TOKEN("rami"), platform: "android", lang: "ar" });
    await (await callerFor(hassan)).push.register({ token: TOKEN("hassan"), platform: "android", lang: "en" });
    await (await callerFor(desk)).push.register({ token: TOKEN("maya"), platform: "android", lang: "en" });
  }, 60_000);
  beforeEach(() => {
    sent.length = 0;
  });
  const to = (who: string) => sent.filter((s) => s.token === TOKEN(who));

  it("remember a phone for whoever is signed in, and forget it on sign-out", async () => {
    const c = await callerFor(customer);
    // The same phone, now signed in by someone else: it moves to them.
    await (await callerFor(owner)).push.register({ token: TOKEN("rami"), platform: "android", lang: "en" });
    expect((await db.select().from(pushDevices).where(eq(pushDevices.token, TOKEN("rami"))))[0].userId).toBe(owner.id);
    await c.push.register({ token: TOKEN("rami"), platform: "android", lang: "ar" });
    // Only your own phone can be forgotten.
    await (await callerFor(hassan)).push.unregister({ token: TOKEN("rami") });
    expect(await db.select().from(pushDevices).where(eq(pushDevices.token, TOKEN("rami")))).toHaveLength(1);
    // At most 5 phones each: the oldest goes.
    for (let i = 0; i < 6; i++) await c.push.register({ token: `${TOKEN("old")}-${i}`, platform: "android", lang: "en" });
    expect(await db.select().from(pushDevices).where(eq(pushDevices.userId, customer.id))).toHaveLength(5);
    for (let i = 0; i < 6; i++) await c.push.unregister({ token: `${TOKEN("old")}-${i}` });
    await c.push.register({ token: TOKEN("rami"), platform: "android", lang: "ar" });
    await expect((await callerFor()).push.register({ token: TOKEN("x"), platform: "android", lang: "en" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("follow a job: the specialist, the professional and the customer each hear their part", async () => {
    const c = await callerFor(customer);
    const s = await callerFor(desk);
    const t = await callerFor(hassan);
    const { id } = await c.requests.create({
      category: "plumbing",
      answers: { problem: "fixture" },
      preferredDate: futureDate(),
      timeSlot: "morning",
      area: "Hamra",
      address: "Street 1",
      phone: "+961 70 000 000",
      media: [],
      ...BEIRUT_PIN,
    });
    expect(to("maya")).toEqual([expect.objectContaining({ title: "A new request needs review", path: "/dashboard", channel: "updates" })]);

    await s.specialist.startReview({ id });
    await s.specialist.sendQuote({ id, amount: "45" });
    // In the language of the customer's app.
    expect(to("rami")).toEqual([expect.objectContaining({ title: "السعر جاهز", path: `/requests/${id}` })]);

    await c.requests.approveQuote({ id, amount: "45" });
    sent.length = 0;
    await s.tech.assign({ requestId: id, technicianId: hassan.id });
    expect(to("hassan")).toEqual([expect.objectContaining({ path: `/tech?job=${id}` })]);
    await s.specialist.setStatus({ id, status: "scheduled" });
    expect(to("rami")).toHaveLength(1);

    sent.length = 0;
    await t.tech.reportLocation({ requestId: id, ...BEIRUT_PIN });
    await t.tech.reportLocation({ requestId: id, lat: BEIRUT_PIN.lat + 0.001, lng: BEIRUT_PIN.lng });
    // "On the way" once, with the trade's name, not at every position.
    expect(to("rami")).toEqual([expect.objectContaining({ title: "السبّاك في الطريق إليك", path: `/requests/${id}` })]);
    await t.tech.fieldEvent({ requestId: id, action: "arrived" });
    expect(to("rami").map((m) => m.title)).toContain("وصل السبّاك");
  });

  it("send emergencies on the urgent channel, and forget phones Firebase no longer knows", async () => {
    const visitor = await callerFor();
    await visitor.emergency.report({ problem: "leak", lat: BEIRUT_PIN.lat, lng: BEIRUT_PIN.lng, phone: "+961 70 123 456" });
    expect(to("maya")).toEqual([expect.objectContaining({ path: "/dashboard?tab=emergencies", channel: "urgent" })]);

    gone.add(TOKEN("maya"));
    sent.length = 0;
    await visitor.emergency.report({ problem: "leak", lat: BEIRUT_PIN.lat, lng: BEIRUT_PIN.lng, phone: "+961 70 123 456" });
    expect(sent).toEqual([]);
    expect(await db.select().from(pushDevices).where(eq(pushDevices.token, TOKEN("maya")))).toHaveLength(0);
  });
});
