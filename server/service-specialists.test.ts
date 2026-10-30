// Specialists per service (one or several): they alone see and handle its requests, emergencies and emails;
// services without one (and Other) go to the admins, who see everything.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { auditLog, requestMedia, type User } from "@db/schema";
import type { Email } from "./lib/email";
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

const state = vi.hoisted(() => ({ db: undefined as unknown, sent: [] as Email[] }));
vi.mock("./queries/connection", () => ({ getDb: () => state.db }));
vi.mock("./lib/env", async () => ({ env: (await import("./test/env")).testEnv() }));
vi.mock("./lib/storage", async (importOriginal) =>
  (await import("./test/harness")).storageStub(importOriginal),
);
vi.mock("./lib/email", () => ({
  sendEmail: async (email: Email) => {
    state.sent.push(email);
  },
}));

describe("service specialists", () => {
  let db: TestDb;
  let owner: User, plumbing: User, cleaning: User, customer: User, tech: User;

  beforeAll(async () => {
    db = await createTestDb();
    state.db = db;
    owner = await makeAdmin("owner@example.com");
    plumbing = await makeSpecialist("maya@example.com", "Maya", ["plumbing", "waterproofing"]);
    cleaning = await makeSpecialist("nadine@example.com", "Nadine", ["cleaning"]);
    customer = await makeUser("rami@example.com", "Rami");
    tech = await makeTechnician("hassan@example.com", "Hassan");
  }, 60_000);
  beforeEach(() => {
    state.sent.length = 0;
  });

  const book = async (category: string, answers: Record<string, string>) =>
    (await callerFor(customer)).requests.create({
      category,
      answers,
      preferredDate: futureDate(),
      timeSlot: "morning",
      area: "Hamra",
      address: "Street 1",
      phone: "+961 70 000 000",
      media: [],
      ...BEIRUT_PIN,
    });
  const recipients = () => state.sent.flatMap((m) => m.to);

  it("see and handle only their own services; admins see everything", async () => {
    const leak = await book("plumbing", { problem: "fixture" });
    const tidy = await book("cleaning", { place: "home", kind: "regular", rooms: "1" });
    const m = await callerFor(plumbing);
    expect(await m.specialist.access()).toMatchObject({ services: ["plumbing", "waterproofing"] });
    const queue = (await m.specialist.queue()).map((r) => r.request.id);
    expect(queue).toContain(leak.id);
    expect(queue).not.toContain(tidy.id);
    await expect(m.specialist.detail({ id: tidy.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(m.specialist.startReview({ id: tidy.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await m.specialist.startReview({ id: leak.id });

    // Photos too: another service's are not theirs to open.
    await db.insert(requestMedia).values([
      { requestId: leak.id, key: "requests/leak.jpg", fileName: "leak.jpg", size: 1, contentType: "image/jpeg" },
      { requestId: tidy.id, key: "requests/tidy.jpg", fileName: "tidy.jpg", size: 1, contentType: "image/jpeg" },
    ]);
    const keys = ["requests/leak.jpg", "requests/tidy.jpg"];
    expect(Object.keys((await m.storage.urls({ keys })).urls)).toEqual(["requests/leak.jpg"]);
    expect(Object.keys((await (await callerFor(owner)).storage.urls({ keys })).urls).sort()).toEqual(keys);

    const all = (await (await callerFor(owner)).specialist.queue()).map((r) => r.request.id);
    expect(all).toEqual(expect.arrayContaining([leak.id, tidy.id]));
    expect(await (await callerFor(owner)).specialist.access()).toMatchObject({ services: null });
  });

  it("get their services' emails; a service nobody has goes to the admins", async () => {
    await book("plumbing", { problem: "fixture" });
    expect(recipients()).toEqual(["maya@example.com"]);
    state.sent.length = 0;
    await book("electrical", { problem: "socket", scope: "single", exposed: "no" });
    expect(recipients()).toEqual(["owner@example.com"]);
  });

  it("answer the emergencies of their services; Other emergencies go to the admins", async () => {
    const visitor = await callerFor();
    const phone = "+961 70 123 456";
    const leak = await visitor.emergency.report({ problem: "leak", lat: BEIRUT_PIN.lat, lng: BEIRUT_PIN.lng, phone });
    expect(recipients()).toEqual(["maya@example.com"]);
    const other = await visitor.emergency.report({ problem: "other", lat: BEIRUT_PIN.lat, lng: BEIRUT_PIN.lng, phone });

    const n = await callerFor(cleaning);
    expect((await n.emergency.waiting()).map((e) => e.id)).toEqual([]);
    await expect(n.emergency.dismiss({ id: leak.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const send = { category: "plumbing", problem: "Burst pipe", ...BEIRUT_PIN, technicianId: tech.id, visitDate: futureDate(0), timeSlot: "morning" as const };
    await expect(n.emergency.create({ ...send, emergencyId: leak.id })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const m = await callerFor(plumbing);
    expect((await m.emergency.waiting()).map((e) => e.id)).toEqual([leak.id]);
    await m.emergency.create({ ...send, emergencyId: leak.id });
    await expect(m.emergency.dismiss({ id: other.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await (await callerFor(owner)).emergency.dismiss({ id: other.id });
  });

  it("are chosen by admins, several on a service if needed, and lose their services when they leave the role", async () => {
    const a = await callerFor(owner);
    const n = await callerFor(cleaning);
    // Nadine joins Maya on Plumbing (twice: nothing more): both see it and both hear about it.
    await a.admin.setServiceSpecialist({ service: "plumbing", specialistId: cleaning.id, on: true });
    await a.admin.setServiceSpecialist({ service: "plumbing", specialistId: cleaning.id, on: true });
    const onPlumbing = (await a.admin.serviceSpecialists()).filter((x) => x.service === "plumbing").map((x) => x.specialistId);
    expect(onPlumbing.sort()).toEqual([plumbing.id, cleaning.id].sort());
    expect((await n.specialist.access()).services?.sort()).toEqual(["cleaning", "plumbing"]);
    state.sent.length = 0;
    const leak = await book("plumbing", { problem: "fixture" });
    expect(recipients().sort()).toEqual(["maya@example.com", "nadine@example.com"]);
    expect((await n.specialist.queue()).map((r) => r.request.id)).toContain(leak.id);

    // Taken off again: Plumbing is Maya's alone.
    await a.admin.setServiceSpecialist({ service: "plumbing", specialistId: cleaning.id, on: false });
    expect((await n.specialist.queue()).map((r) => r.request.id)).not.toContain(leak.id);
    await expect(n.specialist.detail({ id: leak.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Two real changes in the activity log; the repeated click adds nothing.
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "service_specialist_set"))).toHaveLength(2);

    await expect(a.admin.setServiceSpecialist({ service: "other", specialistId: plumbing.id, on: true })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(a.admin.setServiceSpecialist({ service: "ac", specialistId: customer.id, on: true })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      (await callerFor(plumbing)).admin.setServiceSpecialist({ service: "ac", specialistId: plumbing.id, on: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Made an admin: they see everything anyway, and their services go back to the admins.
    await a.admin.setStaffRole({ userId: plumbing.id, role: "admin" });
    expect((await a.admin.serviceSpecialists()).some((x) => x.specialistId === plumbing.id)).toBe(false);
  });
});
