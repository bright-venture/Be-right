import { useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";

/**
 * The dashboard's live queue, kept fresh cheaply: every 10 seconds it only asks whether
 * anything changed (four numbers), and when the answer is different it reloads the queue
 * and the request open on the right, so a customer's or a technician's action shows up
 * without a page reload. A full reload every 5 minutes catches anything that check can't see.
 */
export function useLiveQueue(enabled = true) {
  const utils = trpc.useUtils();
  const queue = trpc.specialist.queue.useQuery(undefined, {
    enabled,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  const version = trpc.specialist.queueVersion.useQuery(undefined, { enabled, refetchInterval: 10_000 });
  const v = version.data;
  const stamp = v
    ? [v.updatedAt ? new Date(v.updatedAt).getTime() : 0, v.latestId ?? 0, v.latestEventId ?? 0, v.latestMediaId ?? 0].join("|")
    : null;
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!stamp) return;
    if (seen.current && seen.current !== stamp) {
      void utils.specialist.queue.invalidate();
      void utils.specialist.detail.invalidate();
    }
    seen.current = stamp;
  }, [stamp, utils]);
  return queue;
}
