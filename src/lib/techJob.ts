import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../server/router";

export type Job = inferRouterOutputs<AppRouter>["tech"]["myJobs"][number];

/**
 * Where a job is, as the technician works it: 1 on the way, 2 before photos and start,
 * 3 after photos and complete, 4 done. Before the visit is scheduled: waiting.
 */
export function jobStep(job: Job): 1 | 2 | 3 | 4 | "wait" | "cancelled" {
  if (job.status === "cancelled") return "cancelled";
  if (job.status === "completed") return 4;
  if (job.status === "in_progress") return 3;
  if (job.status === "scheduled") return job.arrived ? 2 : 1;
  return "wait";
}

/** Still to do (the "To do" tab); completed and cancelled jobs are "Done". */
export const isTodo = (job: Job) => job.status !== "completed" && job.status !== "cancelled";
