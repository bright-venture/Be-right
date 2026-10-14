import { purgeRejectedDocuments } from "./jobs/purgeRejectedDocuments";
import { purgeOrphanUploads } from "./jobs/purgeOrphanUploads";
import { purgeExpiredRateLimits } from "./lib/rateLimit";

// Netlify Scheduled Function (daily; schedule set in netlify.toml). Scheduled
// functions can't be called by URL in production, so this isn't publicly triggerable.
export default async function handler(): Promise<Response> {
  const result = {
    rejectedApplications: await purgeRejectedDocuments(),
    orphanUploads: await purgeOrphanUploads(),
    expiredRateLimits: await purgeExpiredRateLimits(),
  };
  console.log("[cleanup]", result);
  return Response.json(result);
}
