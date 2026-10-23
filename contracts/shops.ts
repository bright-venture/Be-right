// Partner parts shops' opening hours, picked from lists (Admin → Parts shops) rather than
// typed, so every shop reads the same way: "Mon–Sat · 8:00–18:00", "Every day · 24 hours".
import type { LocalText } from "./services";

/** Monday first: 0 = Monday … 6 = Sunday. */
export const WEEK_DAYS: LocalText[] = [
  { en: "Mon", ar: "الإثنين" },
  { en: "Tue", ar: "الثلاثاء" },
  { en: "Wed", ar: "الأربعاء" },
  { en: "Thu", ar: "الخميس" },
  { en: "Fri", ar: "الجمعة" },
  { en: "Sat", ar: "السبت" },
  { en: "Sun", ar: "الأحد" },
];

export interface ShopSchedule {
  /** The days it opens (0 = Monday … 6 = Sunday), in order. */
  days: number[];
  /** "HH:MM", 24-hour; absent when open 24 hours. */
  open?: string;
  close?: string;
  allDay?: boolean;
}

/** Every half hour, 05:00 to 23:30, then midnight (closing only). */
export const OPEN_TIMES = Array.from({ length: 38 }, (_, i) => {
  const minutes = 5 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${minutes % 60 === 0 ? "00" : "30"}`;
});
export const CLOSE_TIMES = [...OPEN_TIMES.slice(1), "24:00"];

/** Quick picks for the days. */
export const DAY_PRESETS: { label: LocalText; days: number[] }[] = [
  { label: { en: "Mon–Fri", ar: "الإثنين–الجمعة" }, days: [0, 1, 2, 3, 4] },
  { label: { en: "Mon–Sat", ar: "الإثنين–السبت" }, days: [0, 1, 2, 3, 4, 5] },
  { label: { en: "Every day", ar: "كل يوم" }, days: [0, 1, 2, 3, 4, 5, 6] },
];

/** A schedule that makes sense: some days, and times in order (or open 24 hours). */
export function isValidSchedule(s: ShopSchedule) {
  const daysOk = s.days.length > 0 && s.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (!daysOk) return false;
  if (s.allDay) return true;
  return !!s.open && !!s.close && OPEN_TIMES.includes(s.open) && CLOSE_TIMES.includes(s.close) && s.close > s.open;
}

/** "8:00" from "08:00". */
const time = (hhmm: string) => hhmm.replace(/^0/, "");

/** The days as short ranges: "Mon–Sat", "Mon–Fri, Sun", "Every day". */
export function formatDays(days: number[], lang: "en" | "ar") {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return lang === "ar" ? "كل يوم" : "Every day";
  const runs: number[][] = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && d === last[last.length - 1] + 1) last.push(d);
    else runs.push([d]);
  }
  const name = (d: number) => WEEK_DAYS[d][lang];
  return runs
    .map((r) => (r.length >= 3 ? `${name(r[0])}–${name(r[r.length - 1])}` : r.map(name).join(lang === "ar" ? "، " : ", ")))
    .join(lang === "ar" ? "، " : ", ");
}

/** The whole line: "Mon–Sat · 8:00–18:00", "Every day · 24 hours". */
export function formatSchedule(s: ShopSchedule, lang: "en" | "ar") {
  const hours = s.allDay ? (lang === "ar" ? "٢٤ ساعة" : "24 hours") : `${time(s.open ?? "")}–${time(s.close ?? "")}`;
  return `${formatDays(s.days, lang)} · ${hours}`;
}
