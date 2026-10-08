import { TRPCError } from "@trpc/server";
import { LIMITS, rateLimit } from "./rateLimit";
import { notify } from "../notify";

/** If the database is down the shared counter is too: then each server instance keeps its own. */
let lastLocalAlert = 0;

/**
 * Unexpected server errors email the admins, so a run of failures doesn't go unnoticed.
 * At most one email an hour; the details stay in the server logs (Netlify → Logs → Functions).
 */
export async function alertServerError(path: string) {
  try {
    await rateLimit("alert:server-error", LIMITS.serverErrorAlert);
  } catch (error) {
    if (error instanceof TRPCError) return; // already sent this hour
    if (Date.now() - lastLocalAlert < LIMITS.serverErrorAlert.windowSeconds * 1000) return;
  }
  lastLocalAlert = Date.now();
  await notify.serverError(path);
}
