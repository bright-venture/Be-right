// Protection against scripted abuse of the public endpoints: rate limits, and the
// daily clean-up of uploads that were never attached to an application or booking.
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { rateLimits, requestMedia, serviceRequests, technicianApplications, users, type User } from "@db/schema";
import {
  callerFor,
  createTestDb,
  deletedDocuments,
  deletedMedia,
  documentKeys,
  futureDate,
  makeUser,
  storedFiles,
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
  },
}));
vi.mock("./lib/storage", async (importOriginal) =>
  (await import("./test/harness")).storageStub(importOriginal),
);

const HOUR = 3_600_000;
let db: TestDb;
let customer: User;

beforeAll(async () => {
  db = await createTestDb();
  state.db = db;
  customer = await makeUser("customer@example.com");
}, 60_000);

beforeEach(async () => {
  await db.delete(rateLimits);
});

const doc = { kind: "photo" as const, fileName: "me.jpg", size: 1000, contentType: "image/jpeg" };
const tooMany = { code: "TOO_MANY_REQUESTS" };

describe("rate limits", () => {
  it("caps technician document uploads per IP", async () => {
    const c = await callerFor(undefined, { ip: "1.1.1.1" });
    for (let i = 0; i < 10; i++) await c.storage.createDocumentUpload(doc);
    await expect(c.storage.createDocumentUpload(doc)).rejects.toMatchObject(tooMany);
    // Someone else isn't affected.
    await expect((await callerFor(undefined, { ip: "2.2.2.2" })).storage.createDocumentUpload(doc)).resolves.toBeTruthy();
  });

  it("caps technician document uploads from everyone per day", async () => {
    for (let i = 0; i < 60; i++) await (await callerFor()).storage.createDocumentUpload(doc);
    await expect((await callerFor()).storage.createDocumentUpload(doc)).rejects.toMatchObject(tooMany);
  });

  it("opens again once the window has passed", async () => {
    const c = await callerFor(undefined, { ip: "3.3.3.3" });
    for (let i = 0; i < 10; i++) await c.storage.createDocumentUpload(doc);
    await expect(c.storage.createDocumentUpload(doc)).rejects.toMatchObject(tooMany);
    await db
      .update(rateLimits)
      .set({ windowStart: new Date(Date.now() - 2 * HOUR) })
      .where(eq(rateLimits.key, "doc-upload:ip:3.3.3.3"));
    await expect(c.storage.createDocumentUpload(doc)).resolves.toBeTruthy();
  });

  it("caps technician applications per IP", async () => {
    const c = await callerFor(undefined, { ip: "4.4.4.4" });
    const apply = (n: number) =>
      c.join.submit({
        name: `Applicant ${n}`,
        phone: "+961 70 123 456",
        email: `applicant${n}@example.com`,
        trade: "plumbing",
        area: "Beirut",
        experience: "1-3",
        availability: "full_time",
        hasTools: true,
        transport: "motorcycle",
        notes: "Licensed, 8 years with residential buildings",
        ...documentKeys(),
        consent: true,
      });
    for (let i = 0; i < 5; i++) await apply(i);
    await expect(apply(5)).rejects.toMatchObject(tooMany);
  });

  it("caps booking uploads per customer", async () => {
    const c = await callerFor(customer);
    const media = { fileName: "leak.jpg", size: 1000, contentType: "image/jpeg" };
    for (let i = 0; i < 40; i++) await c.storage.createUpload(media);
    await expect(c.storage.createUpload(media)).rejects.toMatchObject(tooMany);
  });

  it("caps bookings per customer (each one emails every specialist)", async () => {
    const c = await callerFor(customer);
    const booking = {
      category: "plumbing",
      answers: { problem: "fixture" },
      preferredDate: futureDate(),
      timeSlot: "morning" as const,
      area: "Hamra",
      address: "Street 1",
      phone: "+961 70 000 000",
      media: [],
      lat: 33.8886,
      lng: 35.5195,
    };
    for (let i = 0; i < 20; i++) await c.requests.create(booking);
    await expect(c.requests.create(booking)).rejects.toMatchObject(tooMany);
  });

  it("forgets old counters", async () => {
    const { purgeExpiredRateLimits } = await import("./lib/rateLimit");
    await db.insert(rateLimits).values([
      { key: "old", windowStart: new Date(Date.now() - 3 * 24 * HOUR), count: 3 },
      { key: "recent", windowStart: new Date(), count: 1 },
    ]);
    expect(await purgeExpiredRateLimits()).toBe(1);
    expect((await db.select().from(rateLimits)).map((r) => r.key)).toEqual(["recent"]);
  });
});

describe("unused upload clean-up", () => {
  it("deletes uploads never attached to an application or booking, after a day", async () => {
    const { purgeOrphanUploads } = await import("./jobs/purgeOrphanUploads");
    const old = new Date(Date.now() - 2 * 24 * HOUR);
    const docKey = (kind: string) => `applications/${randomUUID()}/${kind}-file.jpg`;
    const mediaKey = () => `requests/${customer.authId}/${randomUUID()}-photo.jpg`;

    // Documents: one submitted, one kept as a hired technician's photo, one abandoned, one too recent.
    const submitted = documentKeys();
    await db.insert(technicianApplications).values({
      name: "Submitted",
      phone: "+961 70 000 000",
      trade: "plumbing",
      area: "Beirut",
      ...submitted,
    });
    const avatar = docKey("photo");
    await db.update(users).set({ avatar }).where(eq(users.id, customer.id));
    const abandonedDoc = docKey("idDocument");
    const freshDoc = docKey("photo");

    // Booking media: one on a request, one from a booking that was never sent.
    const [request] = await db
      .insert(serviceRequests)
      .values({
        userId: customer.id,
        category: "plumbing",
        answers: "{}",
        urgencySuggested: "normal",
        preferredDate: futureDate(),
        timeSlot: "morning",
        area: "Hamra",
        address: "Street 1",
        phone: "+961 70 000 000",
      })
      .returning();
    const attached = mediaKey();
    await db.insert(requestMedia).values({ requestId: request.id, key: attached, fileName: "a.jpg", size: 1 });
    const abandonedMedia = mediaKey();

    storedFiles.push(
      ...Object.values(submitted).map((key) => ({ bucket: "docs" as const, key, createdAt: old })),
      { bucket: "docs", key: avatar, createdAt: old },
      { bucket: "docs", key: abandonedDoc, createdAt: old },
      { bucket: "docs", key: freshDoc, createdAt: new Date() },
      { bucket: "media", key: attached, createdAt: old },
      { bucket: "media", key: abandonedMedia, createdAt: old },
    );

    expect(await purgeOrphanUploads({ dryRun: true })).toMatchObject({ documents: 1, media: 1, dryRun: true });
    expect(deletedDocuments).not.toContain(abandonedDoc);

    expect(await purgeOrphanUploads()).toMatchObject({ documents: 1, media: 1 });
    expect(deletedDocuments).toContain(abandonedDoc);
    expect(deletedMedia).toEqual([abandonedMedia]);
    for (const kept of [...Object.values(submitted), avatar, freshDoc]) expect(deletedDocuments).not.toContain(kept);
  });
});

describe("upload types", () => {
  it("accepts photos, PDFs for papers and videos for bookings, but never SVG", async () => {
    const anyone = await callerFor();
    const svg = { fileName: "x.svg", size: 1000, contentType: "image/svg+xml" };
    for (const kind of ["photo", "idDocument"] as const) {
      await expect(anyone.storage.createDocumentUpload({ kind, ...svg })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await expect(
      anyone.storage.createDocumentUpload({ kind: "idDocument", fileName: "id.pdf", size: 1000, contentType: "application/pdf" }),
    ).resolves.toBeTruthy();
    await expect(
      anyone.storage.createDocumentUpload({ kind: "photo", fileName: "me.heic", size: 1000, contentType: "image/heic" }),
    ).resolves.toBeTruthy();

    const c = await callerFor(customer);
    await expect(c.storage.createUpload(svg)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(c.storage.createUpload({ fileName: "leak.mp4", size: 1000, contentType: "video/mp4" })).resolves.toBeTruthy();
    await expect(c.storage.createUpload({ fileName: "leak.png", size: 1000, contentType: "image/png" })).resolves.toBeTruthy();
  });
});
