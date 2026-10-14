// Run the daily clean-up by hand: `npm run cleanup:documents` (add `-- --dry-run` to preview).
import { purgeRejectedDocuments } from "./purgeRejectedDocuments";
import { purgeOrphanUploads } from "./purgeOrphanUploads";
import { purgeOldEmergencies } from "./purgeOldEmergencies";

const dryRun = process.argv.includes("--dry-run");
const verb = dryRun ? "[dry run] Would delete" : "Deleted";
const rejected = await purgeRejectedDocuments({ dryRun });
console.log(
  `${verb} ${rejected.files} file(s) from ${rejected.applications} rejected application(s) (rejected before ${rejected.cutoff}).`,
);
const orphans = await purgeOrphanUploads({ dryRun });
console.log(
  `${verb} ${orphans.documents} unsubmitted application document(s) and ${orphans.media} unsent booking photo(s)/video(s).`,
);
const emergencies = await purgeOldEmergencies({ dryRun });
console.log(`${verb} ${emergencies.emergencies} Emergency button entr(ies) from before ${emergencies.cutoff}.`);
process.exit(0);
