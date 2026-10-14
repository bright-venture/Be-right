/** True if `date` is within the last `minutes` (e.g. is the technician's position still live?). */
export function isRecent(date: Date | string, minutes: number, now = Date.now()) {
  return now - new Date(date).getTime() < minutes * 60_000;
}

const locale = (lang: string) => (lang === "ar" ? "ar" : "en-GB");

/** A visit day (YYYY-MM-DD) as people say it: "Sat 12 Oct" / "السبت ١٢ أكتوبر". */
export function formatVisitDay(day: string, lang: string) {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(locale(lang), { weekday: "short", day: "numeric", month: "short" });
}

/** When something happened: "7 Oct, 14:05". */
export function formatMoment(when: Date | string, lang: string) {
  return new Date(when).toLocaleString(locale(lang), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** How long ago, in words: "12 min. ago", "3 hr. ago", "yesterday". */
export function timeAgo(when: Date | string, lang: string, now = Date.now()) {
  const minutes = Math.round((now - new Date(when).getTime()) / 60_000);
  const format = new Intl.RelativeTimeFormat(locale(lang), { numeric: "auto", style: "short" });
  if (minutes < 60) return format.format(-Math.max(0, minutes), "minute");
  if (minutes < 24 * 60) return format.format(-Math.round(minutes / 60), "hour");
  return format.format(-Math.round(minutes / (24 * 60)), "day");
}

/** A meeting's date and time in this device's time zone, as shown to admins. */
export function meetingDate(at: Date | string, lang: string) {
  return new Date(at).toLocaleString(locale(lang), {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
