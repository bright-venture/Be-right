// When a visit is: a time of day (Morning, Afternoon, Evening), or, for services booked by the
// hour (Cleaning, Porter), from when to when. One wording everywhere: app, dashboard, emails.
import { t } from "./i18n";
import { arabicDigits } from "./legal";
import type { LocalText } from "./services";
import { HOURS_OPEN, type TimeSlot } from "./workflow";

const SLOT_TEXT: Record<TimeSlot, LocalText> = {
  morning: t.book.slotMorning,
  afternoon: t.book.slotAfternoon,
  evening: t.book.slotEvening,
};

/** "9:00", "١٣:٠٠". */
export const hourText = (hour: number): LocalText => ({ en: `${hour}:00`, ar: `${arabicDigits(hour)}:٠٠` });

/** How many hours: "4 hours", "٤ ساعات". */
export function hoursCount(n: number): LocalText {
  return {
    en: `${n} hour${n === 1 ? "" : "s"}`,
    ar: n === 1 ? "ساعة واحدة" : n === 2 ? "ساعتان" : n <= 10 ? `${arabicDigits(n)} ساعات` : `${arabicDigits(n)} ساعة`,
  };
}

/** "From 9:00 to 13:00 · 4 hours". */
export function hoursText(from: number, to: number): LocalText {
  const [a, b, n] = [hourText(from), hourText(to), hoursCount(to - from)];
  return { en: `From ${a.en} to ${b.en} · ${n.en}`, ar: `من ${a.ar} إلى ${b.ar} · ${n.ar}` };
}

/** A request's visit time, in both languages. */
export function visitTime(r: { timeSlot: string; startHour?: number | null; endHour?: number | null }): LocalText {
  if (r.startHour != null && r.endHour != null && r.startHour >= HOURS_OPEN) return hoursText(r.startHour, r.endHour);
  return SLOT_TEXT[r.timeSlot as TimeSlot] ?? { en: r.timeSlot, ar: r.timeSlot };
}
