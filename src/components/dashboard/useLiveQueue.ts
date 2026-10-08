import { useEffect, useRef } from "react";
import { trpc } from "@/providers/trpc";

/**
 * The dashboard's live queue, kept fresh cheaply: every 30 seconds it only asks whether
 * anything changed (two numbers), and reloads the whole queue when the answer is different.
 * A full reload every 5 minutes catches anything that check can't see.
 */
export function useLiveQueue(enabled = true) {
  const utils = trpc.useUtils();
  const queue = trpc.specialist.queue.useQuery(undefined, {
    enabled,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  const version = trpc.specialist.queueVersion.useQuery(undefined, { enabled, refetchInterval: 30_000 });
  const stamp = version.data
    ? `${version.data.updatedAt ? new Date(version.data.updatedAt).getTime() : 0}|${version.data.latestId ?? 0}`
    : null;
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!stamp) return;
    if (seen.current && seen.current !== stamp) void utils.specialist.queue.invalidate();
    seen.current = stamp;
  }, [stamp, utils]);
  return queue;
}
