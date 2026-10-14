import { lt } from "drizzle-orm";
import { EMERGENCY_RETENTION_DAYS } from "@contracts/emergency";
import { getDb } from "../queries/connection";
import { emergencyCalls } from "../../db/schema";

/** Deletes Emergency button entries (with the name and phone they hold) older than EMERGENCY_RETENTION_DAYS. */
export async function purgeOldEmergencies({ now = new Date(), dryRun = false } = {}) {
  const cutoff = new Date(now.getTime() - EMERGENCY_RETENTION_DAYS * 86_400_000);
  const old = lt(emergencyCalls.createdAt, cutoff);
  const rows = dryRun
    ? await getDb().select({ id: emergencyCalls.id }).from(emergencyCalls).where(old)
    : await getDb().delete(emergencyCalls).where(old).returning({ id: emergencyCalls.id });
  return { emergencies: rows.length, cutoff: cutoff.toISOString() };
}
