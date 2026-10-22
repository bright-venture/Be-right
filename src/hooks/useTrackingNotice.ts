import { useI18n } from "@/i18n";
import type { TrackingNotice } from "@/lib/presence";

/** The phone app's notification while it shares the technician's location in the background. */
export function useTrackingNotice(): TrackingNotice {
  const { t, p } = useI18n();
  return { title: p(t.tech.noticeTitle), message: p(t.tech.noticeMessage) };
}
