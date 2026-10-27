// Single source of truth for how a repair request moves through its life cycle,
// and for validating what a customer submits. Shared by the API and the UI.
import { CATEGORY_MAP, type RequestStatus } from "./services";
import { WORKMANSHIP_GUARANTEE_DAYS } from "./legal";

export const TIME_SLOTS = ["morning", "afternoon", "evening"] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];

/**
 * Allowed status changes and who may make them.
 *   specialist: admin dashboard · customer: request owner · technician: assigned technician
 */
export const TRANSITIONS = {
  startReview: { from: ["submitted"], to: "in_review", by: "specialist" },
  // Sending again while the customer hasn't answered replaces the quote.
  sendQuote: { from: ["in_review", "quote_ready"], to: "quote_ready", by: "specialist" },
  // Guarantee visits skip the price: the specialist confirms the return visit is free.
  acceptGuarantee: { from: ["in_review"], to: "approved", by: "specialist" },
  approveQuote: { from: ["quote_ready"], to: "approved", by: "customer" },
  schedule: { from: ["approved"], to: "scheduled", by: "specialist" },
  startWork: { from: ["scheduled"], to: "in_progress", by: "specialist|technician" },
  complete: { from: ["in_progress"], to: "completed", by: "specialist|technician" },
  // Once a visit is scheduled the customer asks to cancel (requestCancel) and a specialist confirms.
  cancel: { from: ["submitted", "in_review", "quote_ready", "approved"], to: "cancelled", by: "customer" },
  // The technician went but no repair happened: a specialist closes the job charging the visit fee.
  closeWithVisitFee: { from: ["scheduled", "in_progress"], to: "cancelled", by: "specialist" },
  // A specialist can close any open request (spam, out of area, customer asked), with a reason.
  close: {
    from: ["submitted", "in_review", "quote_ready", "approved", "scheduled", "in_progress"],
    to: "cancelled",
    by: "specialist",
  },
} as const satisfies Record<
  string,
  { from: readonly RequestStatus[]; to: RequestStatus; by: string }
>;

export type TransitionName = keyof typeof TRANSITIONS;

export function canTransition(name: TransitionName, status: RequestStatus) {
  return (TRANSITIONS[name].from as readonly RequestStatus[]).includes(status);
}

/** Until when a job completed at `completedAt` can be reported under the workmanship guarantee. */
export function guaranteeEndsAt(completedAt: Date) {
  return new Date(completedAt.getTime() + WORKMANSHIP_GUARANTEE_DAYS * 86_400_000);
}

/**
 * The visit fee (minimum charge), in USD. Saved on each request when it's booked.
 * - Repair goes ahead: it's included in the quote, nothing extra.
 * - No repair: a specialist (only) closes the job charging it, for one of VISIT_FEE_REASONS.
 * - Guarantee visits never have one.
 */
export { VISIT_FEE_USD } from "./legal";
export const VISIT_FEE_REASONS = ["no_work", "no_access", "late_cancel"] as const;
export type VisitFeeReason = (typeof VISIT_FEE_REASONS)[number];
/** What a technician can report from the visit, for the specialist to act on. */
/** How each reason reads in the request timeline and in emails. */
export const VISIT_FEE_REASON_LABEL: Record<VisitFeeReason, string> = {
  no_work: "No repair done",
  no_access: "Nobody there at the agreed time",
  late_cancel: "Cancelled after the professional set off",
};
export const VISIT_REPORTS = ["no_work", "no_access"] as const satisfies readonly VisitFeeReason[];

/** Photos/videos a customer can add when reporting a problem. */
export const MAX_PROBLEM_FILES = 4;

/** Statuses in which the customer can ask a specialist to cancel (they can't cancel directly). */
export const CANCEL_REQUESTABLE_STATUSES: readonly RequestStatus[] = ["scheduled"];

/** Statuses in which a technician may be (re)assigned: only after the customer approved. */
export const ASSIGNABLE_STATUSES: readonly RequestStatus[] = ["approved", "scheduled", "in_progress"];

/** Statuses in which the job is live for the technician (location sharing, field actions). */
export const ACTIVE_JOB_STATUSES: readonly RequestStatus[] = ["scheduled", "in_progress"];

/**
 * Who a request's photo comes from: the customer (booking or problem report), or the
 * technician documenting the job before starting work and after finishing it.
 */
export const MEDIA_KINDS = ["customer", "before", "after"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export const JOB_PHOTO_KINDS = ["before", "after"] as const satisfies readonly MediaKind[];
export type JobPhotoKind = (typeof JOB_PHOTO_KINDS)[number];
/** Photos a technician can add per side (before / after) of one job. */
export const MAX_JOB_PHOTOS = 6;

/** Photos/videos per booking. Videos can't be shrunk in the browser, so they're capped. */
export const MAX_BOOKING_FILES = 8;
export const MAX_BOOKING_VIDEOS = 2;

/** Quote amounts in USD: whole dollars or cents, up to 999,999.99. */
export const QUOTE_AMOUNT_PATTERN = /^\d{1,6}(\.\d{1,2})?$/;

/**
 * Checks guided answers against the category's question tree: only questions that
 * are actually shown may be answered, every shown question must be answered, and
 * choice answers must be one of the offered options. Returns an error message or null.
 */
export function validateAnswers(categoryId: string, answers: Record<string, string>): string | null {
  const cat = CATEGORY_MAP[categoryId];
  if (!cat) return "Unknown category";
  const visible = cat.questions.filter((q) => !q.when || answers[q.when.id] === q.when.equals);
  const visibleIds = new Set(visible.map((q) => q.id));
  for (const key of Object.keys(answers)) {
    if (!visibleIds.has(key)) return `Unexpected answer: ${key}`;
  }
  for (const q of visible) {
    const value = answers[q.id];
    if (!value) return `Missing answer: ${q.id}`;
    if (q.kind === "choice" && !q.options?.some((o) => o.value === value)) {
      return `Invalid answer for ${q.id}`;
    }
    if (q.kind === "text" && value.length > 500) return `Answer too long: ${q.id}`;
  }
  return null;
}

/**
 * Answers handed over in a link (the home page's service picker: `/book?cat=…&ans=…`):
 * keeps only those that fit the category's questions, so an outdated or edited link
 * can't pre-fill anything the booking form wouldn't offer.
 */
export function answersFromLink(categoryId: string, raw: string | null): Record<string, string> {
  const cat = CATEGORY_MAP[categoryId];
  if (!cat || !raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};
  const answers: Record<string, string> = {};
  for (const q of cat.questions) {
    const value = (parsed as Record<string, unknown>)[q.id];
    if (typeof value !== "string") continue;
    const fits = q.kind === "choice" ? !!q.options?.some((o) => o.value === value) : value.length <= 500;
    if (fits) answers[q.id] = value;
  }
  // A follow-up question only counts when the answer it depends on was given.
  for (const q of cat.questions) {
    if (q.when && answers[q.when.id] !== q.when.equals) delete answers[q.id];
  }
  return answers;
}

/** YYYY-MM-DD that is a real calendar date, not before `today` (also YYYY-MM-DD). */
export function isValidVisitDate(value: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return false;
  return value >= today;
}

/** Today's date where this device is, as YYYY-MM-DD (the forms' earliest visit day). */
export function todayHere(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA").format(now);
}

/**
 * The earliest date that is still "today" somewhere on Earth (UTC-12), as YYYY-MM-DD. The
 * server accepts visit days from then on, so a customer's own today is never refused,
 * whatever their time zone.
 */
export function earliestTodayAnywhere(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Etc/GMT+12" }).format(now);
}
