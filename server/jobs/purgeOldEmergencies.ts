import { lt } from "drizzle-orm";
import { EMERGENCY_RETENTION_DAYS } from "@contracts/emergency";
import { getDb } from "../queries/connection";
import { emergencyRequests } from "../../db/schema";

/** Deletes sent emergencies (with the location they hold) older than EMERGENCY_RETENTION_DAYS. */
export async function purgeOldEmergencies({ now = new Date(), dryRun = false } = {}) {
  const cutoff = new Date(now.getTime() - EMERGENCY_RETENTION_DAYS * 86_400_000);
  const old = lt(emergencyRequests.createdAt, cutoff);
  const rows = dryRun
    ? await getDb().select({ id: emergencyRequests.id }).from(emergencyRequests).where(old)
    : await getDb().delete(emergencyRequests).where(old).returning({ id: emergencyRequests.id });
  return { emergencies: rows.length, cutoff: cutoff.toISOString() };
}
