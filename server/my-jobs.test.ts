// My jobs (professionals): every open job, the latest done ones, and older done jobs a page
// at a time, so the list doesn't grow with every job ever done.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { serviceRequests, type User } from "@db/schema";
import { RECENT_DONE_JOBS } from "@contracts/workflow";
import { callerFor, createTestDb, futureDate, makeTechnician, makeUser, type TestDb } from "./test/harness";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("./queries/connection", () => ({ getDb: () => state.db }));
vi.mock("./lib/env", async () => ({ env: (await import("./test/env")).testEnv() }));
vi.mock("./lib/storage", async (importOriginal) =>
  (await import("./test/harness")).storageStub(importOriginal),
);
vi.mock("./lib/email", () => ({ sendEmail: async () => true }));

describe("my jobs", () => {
  let db: TestDb;
  let customer: User, hassan: User, karim: User;
  const done: number[] = [];
  const open: number[] = [];

  beforeAll(async () => {
    db = await createTestDb();
    state.db = db;
    customer = await makeUser("rami@example.com", "Rami");
    hassan = await makeTechnician("hassan@example.com", "Hassan");
    karim = await makeTechnician("karim@example.com", "Karim");
    const job = (technicianId: number, status: "completed" | "cancelled" | "scheduled" | "in_progress") => ({
      userId: customer.id,
      technicianId,
      category: "plumbing",
      answers: JSON.stringify({ problem: "fixture" }),
      status,
      preferredDate: futureDate(),
      timeSlot: "morning",
      area: "Hamra",
      address: "Street 1",
      phone: "+961 70 000 000",
    });
    for (let i = 0; i < RECENT_DONE_JOBS + 5; i++) {
      const [row] = await db
        .insert(serviceRequests)
        .values(job(hassan.id, i % 4 === 0 ? "cancelled" : "completed"))
        .returning({ id: serviceRequests.id });
      done.push(row.id);
    }
    for (const status of ["scheduled", "in_progress"] as const) {
      const [row] = await db.insert(serviceRequests).values(job(hassan.id, status)).returning({ id: serviceRequests.id });
      open.push(row.id);
    }
    await db.insert(serviceRequests).values(job(karim.id, "completed"));
  }, 60_000);

  it("bring every open job and only the latest done ones", async () => {
    const ids = (await (await callerFor(hassan)).tech.myJobs()).map((j) => j.id);
    expect(ids).toEqual(expect.arrayContaining(open));
    const latest = [...done].sort((a, b) => b - a).slice(0, RECENT_DONE_JOBS);
    expect(ids.filter((id) => done.includes(id)).sort((a, b) => b - a)).toEqual(latest);
    expect(ids).toHaveLength(open.length + RECENT_DONE_JOBS);
  });

  it("show older done jobs a page at a time, only their own", async () => {
    const t = await callerFor(hassan);
    const oldestShown = Math.min(...(await t.tech.myJobs()).filter((j) => done.includes(j.id)).map((j) => j.id));
    const page = await t.tech.myPastJobs({ cursor: oldestShown });
    expect(page.items.map((j) => j.id)).toEqual([...done].sort((a, b) => b - a).slice(RECENT_DONE_JOBS));
    expect(page.nextCursor).toBeNull();
    // Same shape as My jobs (photos, arrived), for the same screens.
    expect(page.items[0]).toMatchObject({ media: [], arrived: false, technicianId: hassan.id });
    await expect((await callerFor(customer)).tech.myPastJobs({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
