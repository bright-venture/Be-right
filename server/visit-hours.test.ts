// Services booked by the hour (Cleaning, Porter): the customer picks from when to when.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { serviceRequests, type User } from "@db/schema";
import { hoursText, visitTime } from "@contracts/visitTime";
import { BEIRUT_PIN, callerFor, createTestDb, futureDate, makeUser, type TestDb } from "./test/harness";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("./queries/connection", () => ({ getDb: () => state.db }));
vi.mock("./lib/env", async () => ({ env: (await import("./test/env")).testEnv() }));
vi.mock("./lib/storage", async (importOriginal) =>
  (await import("./test/harness")).storageStub(importOriginal),
);
vi.mock("./lib/email", () => ({ sendEmail: async () => true }));

describe("visit hours", () => {
  let db: TestDb;
  let customer: User;
  beforeAll(async () => {
    db = await createTestDb();
    state.db = db;
    customer = await makeUser("rami@example.com", "Rami");
  }, 60_000);

  const visit = {
    preferredDate: futureDate(),
    timeSlot: "morning" as const,
    area: "Hamra",
    address: "Street 1",
    phone: "+961 70 000 000",
    media: [],
    ...BEIRUT_PIN,
  };
  const cleaning = { ...visit, category: "cleaning", answers: { place: "home", kind: "regular", rooms: "2" } };
  const saved = async (id: number) => (await db.select().from(serviceRequests).where(eq(serviceRequests.id, id)))[0];

  it("are saved for Cleaning and Porter, with the time of day following the start", async () => {
    const c = await callerFor(customer);
    const { id } = await c.requests.create({ ...cleaning, hours: { from: 14, to: 18 } });
    expect(await saved(id)).toMatchObject({ startHour: 14, endHour: 18, timeSlot: "afternoon" });
    const porter = await c.requests.create({ ...visit, category: "porter", answers: { help: "home_move", floors: "elevator" }, hours: { from: 8, to: 21 } });
    expect(await saved(porter.id)).toMatchObject({ startHour: 8, endHour: 21, timeSlot: "morning" });
  });

  it("stay between 8:00 and 21:00, end after start, and only for services booked by the hour", async () => {
    const c = await callerFor(customer);
    for (const hours of [
      { from: 7, to: 10 },
      { from: 18, to: 22 },
      { from: 12, to: 12 },
      { from: 15, to: 11 },
    ]) {
      await expect(c.requests.create({ ...cleaning, hours })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await expect(
      c.requests.create({ ...visit, category: "plumbing", answers: { problem: "fixture" }, hours: { from: 9, to: 11 } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Porter no longer asks "For how long?": the hours say it.
    await expect(
      c.requests.create({ ...visit, category: "porter", answers: { help: "home_move", duration: "day", floors: "elevator" }, hours: { from: 9, to: 11 } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("read the same everywhere, in both languages", () => {
    expect(hoursText(9, 13)).toEqual({ en: "From 9:00 to 13:00 · 4 hours", ar: "من ٩:٠٠ إلى ١٣:٠٠ · ٤ ساعات" });
    expect(hoursText(9, 10).en).toBe("From 9:00 to 10:00 · 1 hour");
    expect(hoursText(9, 11).ar).toBe("من ٩:٠٠ إلى ١١:٠٠ · ساعتان");
    expect(visitTime({ timeSlot: "evening", startHour: null, endHour: null }).en).toBe("Evening (5–9)");
  });
});
