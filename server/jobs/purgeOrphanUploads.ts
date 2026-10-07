import { inArray, or } from "drizzle-orm";
import { requestMedia, technicianApplications, users } from "@db/schema";
import { getDb } from "../queries/connection";
import { deleteFiles, DOCUMENT_PREFIX, listFilesCreatedBefore, MEDIA_PREFIX } from "../lib/storage";

/** Uploads get a day to be attached to an application or a booking. */
export const ORPHAN_GRACE_HOURS = 24;

/**
 * Deletes uploads nothing points to: documents from technician applications that were
 * never submitted (they're IDs, so they shouldn't linger) and photos/videos from
 * bookings that were never sent. Safe to run repeatedly.
 */
export async function purgeOrphanUploads({ now = new Date(), dryRun = false } = {}) {
  const db = getDb();
  const before = new Date(now.getTime() - ORPHAN_GRACE_HOURS * 3_600_000);
  const [docs, media] = await Promise.all([
    listFilesCreatedBefore("docs", DOCUMENT_PREFIX, before),
    listFilesCreatedBefore("media", MEDIA_PREFIX, before),
  ]);

  const usedDocs = new Set<string>();
  if (docs.length) {
    const [apps, avatars] = await Promise.all([
      db
        .select({
          a: technicianApplications.idDocumentKey,
          b: technicianApplications.photoKey,
          c: technicianApplications.criminalRecordKey,
          d: technicianApplications.proofOfAddressKey,
          e: technicianApplications.vehicleRegistrationKey,
        })
        .from(technicianApplications)
        .where(
          or(
            inArray(technicianApplications.idDocumentKey, docs),
            inArray(technicianApplications.photoKey, docs),
            inArray(technicianApplications.criminalRecordKey, docs),
            inArray(technicianApplications.proofOfAddressKey, docs),
            inArray(technicianApplications.vehicleRegistrationKey, docs),
          ),
        ),
      // A hired technician's profile photo stays in use after the application closes.
      db.select({ key: users.avatar }).from(users).where(inArray(users.avatar, docs)),
    ]);
    for (const row of apps) for (const key of [row.a, row.b, row.c, row.d, row.e]) if (key) usedDocs.add(key);
    for (const row of avatars) if (row.key) usedDocs.add(row.key);
  }
  const usedMedia = new Set(
    media.length
      ? (await db.select({ key: requestMedia.key }).from(requestMedia).where(inArray(requestMedia.key, media))).map(
          (r) => r.key,
        )
      : [],
  );

  const orphanDocs = docs.filter((k) => !usedDocs.has(k));
  const orphanMedia = media.filter((k) => !usedMedia.has(k));
  if (!dryRun) {
    if (orphanDocs.length) await deleteFiles("docs", orphanDocs);
    if (orphanMedia.length) await deleteFiles("media", orphanMedia);
  }
  return { documents: orphanDocs.length, media: orphanMedia.length, dryRun };
}
