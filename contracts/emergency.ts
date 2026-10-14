// The Emergency button: the customer picks the service, then what is wrong, then calls
// the emergency line (or, while there is none, asks to be called back). Nothing is
// booked online for an emergency; the team handles it on the phone.
import type { LocalText } from "./services";

/** Logged emergencies are deleted after this many days. */
export const EMERGENCY_RETENTION_DAYS = 90;

export type EmergencyKind = "call" | "callback";

export interface EmergencyProblem {
  id: string;
  label: LocalText;
  /** Possible danger to people: the screen says to call the local emergency number first. */
  danger?: boolean;
}

/**
 * Services that take emergencies, each with what can go wrong (an even number of each, so
 * they sit in full rows). "Something else" is always offered as well.
 */
export const EMERGENCIES: { category: string; problems: EmergencyProblem[] }[] = [
  {
    category: "plumbing",
    problems: [
      { id: "leak", label: { en: "Water leaking or flooding", ar: "تسرّب مياه أو فيضان" } },
      { id: "blocked-toilet", label: { en: "Blocked toilet", ar: "انسداد المرحاض" } },
      { id: "drain-overflow", label: { en: "Drain overflowing", ar: "فيضان من الصرف" } },
      { id: "no-water", label: { en: "No water at all", ar: "انقطاع المياه تماماً" } },
    ],
  },
  {
    category: "electrical",
    problems: [
      { id: "no-power", label: { en: "No power at all", ar: "انقطاع الكهرباء تماماً" } },
      { id: "sparks", label: { en: "Burning smell or sparks", ar: "رائحة احتراق أو شرر" }, danger: true },
      { id: "breaker", label: { en: "Breaker keeps tripping", ar: "القاطع يفصل باستمرار" } },
      { id: "partial-power", label: { en: "Power out in some rooms", ar: "انقطاع الكهرباء في بعض الغرف" } },
    ],
  },
  {
    category: "locksmith",
    problems: [
      { id: "locked-out", label: { en: "Locked out of home or office", ar: "الباب مقفل وأنا خارج المنزل أو المكتب" } },
      { id: "car-lockout", label: { en: "Locked out of my car", ar: "سيارتي مقفلة والمفتاح بداخلها" } },
    ],
  },
  {
    category: "carpentry",
    problems: [
      { id: "broken-door-window", label: { en: "Broken door or window", ar: "باب أو نافذة مكسورة" } },
      { id: "door-wont-lock", label: { en: "Door won't close or lock", ar: "الباب لا يُغلق أو لا يُقفل" } },
    ],
  },
  {
    category: "waterproofing",
    problems: [
      { id: "roof-leak", label: { en: "Water coming through the roof", ar: "تسرّب المياه من السقف" } },
      { id: "wall-leak", label: { en: "Water coming through a wall", ar: "تسرّب المياه من الجدار" } },
    ],
  },
  {
    category: "appliance",
    problems: [
      { id: "appliance-leak", label: { en: "Appliance leaking water", ar: "جهاز يسرّب الماء" } },
      { id: "fridge-stopped", label: { en: "Fridge or freezer stopped", ar: "الثلاجة أو المجمّد توقّف" } },
    ],
  },
];

/** The answer for an emergency not in the list. */
export const OTHER_EMERGENCY = "other";

export const EMERGENCY_MAP = Object.fromEntries(EMERGENCIES.map((e) => [e.category, e]));

/** Is this a known service and emergency (or "other")? */
export function isEmergency(category: string, problem: string) {
  const entry = EMERGENCY_MAP[category];
  return !!entry && (problem === OTHER_EMERGENCY || entry.problems.some((p) => p.id === problem));
}

/** Label for a logged emergency, for the dashboard and emails. */
export function emergencyLabel(category: string, problem: string): LocalText {
  if (problem === OTHER_EMERGENCY) return { en: "Something else", ar: "شيء آخر" };
  return EMERGENCY_MAP[category]?.problems.find((p) => p.id === problem)?.label ?? { en: problem, ar: problem };
}