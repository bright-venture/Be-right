// Privacy Policy: rejected applicants' documents are deleted after the retention period.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { technicianApplications, type User } from "@db/schema";
import { REJECTED_APPLICATION_RETENTION_DAYS as DAYS } from "@contracts/legal";
import {
  ADMIN_EMAIL,
  callerFor,
  createTestDb,
  deletedDocuments,
  documentKeys,
  makeUser,
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
    specialistEmails: ["specialist@example.com"],
  },
}));
vi.mock("./lib/storage", async (importOriginal) =>
  (await import("./test/harness")).storageStub(importOriginal),
);

const DAY = 86_400_000;
let db: TestDb;
let admin: User;

beforeAll(async () => {
  db = await createTestDb();
  state.db = db;
  admin = await makeUser(ADMIN_EMAIL);
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
    expect(preview).toMatchObject({ applications: 2, files: 8, dryRun: true }); // 4 documents each
    expect(deletedDocuments).toHaveLength(0);
    expect((await load(due.id)).idDocumentKey).not.toBeNull();

    const result = await purgeRejectedDocuments();
    expect(result).toMatchObject({ applications: 2, files: 8 });
    expect(deletedDocuments).toEqual(expect.arrayContaining([...due.keys, ...legacy.keys]));

    for (const id of [due.id, legacy.id]) {
      const row = await load(id);
      expect(row).toMatchObject({ idDocumentKey: null, criminalRecordKey: null, proofOfAddressKey: null, photoKey: null });
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

  it("starts the clock when a specialist rejects, and stops it if they change their mind", async () => {
    const { id } = await application("contacted", DAYS + 30);
    const s = await callerFor(admin);
    await s.join.setStatus({ id, status: "rejected" });
    expect((await load(id)).rejectedAt).toBeInstanceOf(Date);
    await s.join.setStatus({ id, status: "contacted" });
    expect((await load(id)).rejectedAt).toBeNull();
  });
});
