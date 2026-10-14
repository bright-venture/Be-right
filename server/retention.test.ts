// Privacy Policy: rejected applicants' documents are deleted after the retention period.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { emergencyRequests, technicianApplications } from "@db/schema";
import { EMERGENCY_RETENTION_DAYS } from "@contracts/emergency";
import { REJECTED_APPLICATION_RETENTION_DAYS as DAYS } from "@contracts/legal";
import {
  callerFor,
  createTestDb,
  deletedDocuments,
  documentKeys,
  makeAdmin,
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

const DAY = 86_400_000;
let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  state.db = db;
}, 60_000);

/** Inserts an application with documents, in a given status, rejected/created `daysAgo`. */
async function application(
  status: "new" | "contacted" | "rejected" | "hired",
  daysAgo: number,
  opts: { recordRejection?: boolean; criminalRecordKey?: string } = {},
) {
  const when = new Date(Date.now() - daysAgo * DAY);
  const docs = { ...documentKeys(), ...(opts.criminalRecordKey && { criminalRecordKey: opts.criminalRecordKey }) };
  const [row] = await db
    .insert(technicianApplications)
    .values({
      name: `Applicant ${status} ${daysAgo}`,
      phone: "+961 1 000 000",
      trade: "plumbing",
      area: "Beirut",
      status,
      createdAt: when,
      rejectedAt: status === "rejected" && opts.recordRejection !== false ? when : null,
      ...docs,
    })
    .returning();
  return { id: row.id, keys: Object.values(docs) };
}

async function load(id: number) {
  const [row] = await db.select().from(technicianApplications).where(eq(technicianApplications.id, id));
  return row;
}

describe("rejected-applicant document clean-up", () => {
  it(`deletes documents ${DAYS}+ days after rejection and keeps everything else`, async () => {
    const { purgeRejectedDocuments } = await import("./jobs/purgeRejectedDocuments");
    const due = await application("rejected", DAYS + 10);
    const legacy = await application("rejected", DAYS + 5, { recordRejection: false }); // counts from submission
    const recent = await application("rejected", 10);
    const pending = await application("contacted", DAYS + 30);
    const hired = await application("hired", DAYS + 30);

    const preview = await purgeRejectedDocuments({ dryRun: true });
    expect(preview).toMatchObject({ applications: 2, files: 10, dryRun: true }); // 5 documents each
    expect(deletedDocuments).toHaveLength(0);
    expect((await load(due.id)).idDocumentKey).not.toBeNull();

    const result = await purgeRejectedDocuments();
    expect(result).toMatchObject({ applications: 2, files: 10 });
    expect(deletedDocuments).toEqual(expect.arrayContaining([...due.keys, ...legacy.keys]));

    for (const id of [due.id, legacy.id]) {
      const row = await load(id);
      expect(row).toMatchObject({ idDocumentKey: null, criminalRecordKey: null, proofOfAddressKey: null, vehicleRegistrationKey: null, photoKey: null });
      expect(row.documentsDeletedAt).toBeInstanceOf(Date);
    }
    for (const { id } of [recent, pending, hired]) {
      expect((await load(id)).photoKey).not.toBeNull();
    }

    // Running again finds nothing new.
    expect(await purgeRejectedDocuments()).toMatchObject({ applications: 0, files: 0 });
  });

  it("keeps every document of hired technicians, criminal record included", async () => {
    const { purgeRejectedDocuments } = await import("./jobs/purgeRejectedDocuments");
    const hired = await application("hired", DAYS + 30);
    await purgeRejectedDocuments();
    for (const key of hired.keys) expect(deletedDocuments).not.toContain(key);
    expect(await load(hired.id)).toMatchObject({
      criminalRecordKey: expect.any(String),
      proofOfAddressKey: expect.any(String),
    });
  });

  it("deletes sent emergencies after the retention period", async () => {
    const { purgeOldEmergencies } = await import("./jobs/purgeOldEmergencies");
    const at = (days: number) => new Date(Date.now() - days * DAY);
    const [old, recent] = await db
      .insert(emergencyRequests)
      .values([
        { problem: "leak", lat: 51.5, lng: -0.12, createdAt: at(EMERGENCY_RETENTION_DAYS + 1) },
        { problem: "leak", lat: 51.5, lng: -0.12, createdAt: at(EMERGENCY_RETENTION_DAYS - 1) },
      ])
      .returning({ id: emergencyRequests.id });
    await purgeOldEmergencies();
    const left = (await db.select({ id: emergencyRequests.id }).from(emergencyRequests)).map((r) => r.id);
    expect(left).not.toContain(old.id);
    expect(left).toContain(recent.id);
  });

  it("starts the clock when a specialist rejects, and stops it if they change their mind", async () => {
    const { id } = await application("contacted", DAYS + 30);
    const s = await callerFor(await makeAdmin("boss@example.com", "Boss"));
    await s.join.setStatus({ id, status: "rejected" });
    expect((await load(id)).rejectedAt).toBeInstanceOf(Date);
    await s.join.setStatus({ id, status: "contacted" });
    expect((await load(id)).rejectedAt).toBeNull();
  });
});
