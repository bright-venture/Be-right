// Priority dispatch: the customer picks the emergency and shares where they are, sends it,
// then calls the emergency line. The specialist who answers sees it in the dashboard, takes
// the rest (name, phone, price) on the phone and sends a technician.
import type { LocalText } from "./services";

/** Sent emergencies are deleted after this many days (the job they became stays). */
export const EMERGENCY_RETENTION_DAYS = 90;

export interface EmergencyProblem {
  id: string;
  label: LocalText;
  /** The service it usually needs (the specialist can change it). */
  category: string | null;
}

/** The emergencies offered, in order (an even number, so they sit in full rows). */
export const EMERGENCY_PROBLEMS: EmergencyProblem[] = [
  { id: "leak", label: { en: "Water leak", ar: "تسرّب مياه" }, category: "plumbing" },
  { id: "blocked-toilet", label: { en: "Blocked toilet", ar: "انسداد المرحاض" }, category: "plumbing" },
  { id: "locked-out", label: { en: "Locked out", ar: "الباب مقفل وأنت في الخارج" }, category: "locksmith" },
  { id: "broken-door-window", label: { en: "Broken door or window", ar: "باب أو نافذة مكسورة" }, category: "carpentry" },
  { id: "no-power", label: { en: "Electrics not working", ar: "عطل في الكهرباء" }, category: "electrical" },
  { id: "damaged-roof", label: { en: "Damaged roof", ar: "سقف متضرّر" }, category: "waterproofing" },
  { id: "no-hot-water", label: { en: "No hot water", ar: "لا توجد مياه ساخنة" }, category: "plumbing" },
  { id: "other", label: { en: "Other emergency", ar: "حالة طارئة أخرى" }, category: null },
];

export const EMERGENCY_PROBLEM_MAP: Record<string, EmergencyProblem> = Object.fromEntries(
  EMERGENCY_PROBLEMS.map((x) => [x.id, x]),
);

export const EMERGENCY_STATUSES = ["open", "dispatched", "dismissed"] as const;
export type EmergencyStatus = (typeof EMERGENCY_STATUSES)[number];
