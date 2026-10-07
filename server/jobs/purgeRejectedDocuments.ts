import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { technicianApplications } from "@db/schema";
import { REJECTED_APPLICATION_RETENTION_DAYS } from "@contracts/legal";
import { getDb } from "../queries/connection";
import { deleteDocuments } from "../lib/storage";

/**
 * Privacy Policy: documents of rejected applicants are deleted
 * REJECTED_APPLICATION_RETENTION_DAYS after rejection. Applications rejected
 * before rejection dates were recorded count from when they were submitted.
 * Safe to run repeatedly; each application is only purged once.
 */
export async function purgeRejectedDocuments({ now = new Date(), dryRun = false } = {}) {
  const db = getDb();
  const cutoff = new Date(now.getTime() - REJECTED_APPLICATION_RETENTION_DAYS * 86_400_000);
  const due = await db
    .select({
      id: technicianApplications.id,
      idDocumentKey: technicianApplications.idDocumentKey,
      criminalRecordKey: technicianApplications.criminalRecordKey,
      proofOfAddressKey: technicianApplications.proofOfAddressKey,
      vehicleRegistrationKey: technicianApplications.vehicleRegistrationKey,
      photoKey: technicianApplications.photoKey,
    })
    .from(technicianApplications)
    .where(
      and(
        eq(technicianApplications.status, "rejected"),
        isNull(technicianApplications.documentsDeletedAt),
        // ISO string + cast: the production driver can't bind a Date inside raw SQL.
        sql`coalesce(${technicianApplications.rejectedAt}, ${technicianApplications.createdAt}) < ${cutoff.toISOString()}::timestamptz`,
        or(
          isNotNull(technicianApplications.idDocumentKey),
          isNotNull(technicianApplications.criminalRecordKey),
          isNotNull(technicianApplications.proofOfAddressKey),
          isNotNull(technicianApplications.vehicleRegistrationKey),
          isNotNull(technicianApplications.photoKey),
        ),
      ),
    );

  const keys = due
    .flatMap((a) => [a.idDocumentKey, a.criminalRecordKey, a.proofOfAddressKey, a.vehicleRegistrationKey, a.photoKey])
    .filter((k): k is string => !!k);
  if (!dryRun && due.length) {
    // Files first: if storage fails, the rows still point at them and the next run retries.
    await deleteDocuments(keys);
    await db
      .update(technicianApplications)
      .set({
        idDocumentKey: null,
        criminalRecordKey: null,
        proofOfAddressKey: null,
        vehicleRegistrationKey: null,
        photoKey: null,
        documentsDeletedAt: now,
      })
      .where(inArray(technicianApplications.id, due.map((a) => a.id)));
  }
  return { applications: due.length, files: keys.length, dryRun, cutoff: cutoff.toISOString() };
}

