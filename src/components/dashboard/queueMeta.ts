import type { RequestStatus } from "@contracts/services";
import { todayHere } from "@contracts/workflow";

/** Statuses where the next move is the specialist's. */
export const NEEDS_SPECIALIST: readonly RequestStatus[] = ["submitted", "in_review", "approved"];
const OPEN_EXCLUDED: readonly RequestStatus[] = ["completed", "cancelled"];

export type QueueView =
  | "open"
  | "needsAction"
  | "waitingCustomer"
  | "inProgress"
  | "doneToday"
  | "completed"
  | "cancelled"
  | "all";

type Row = {
  status: string;
  updatedAt: Date;
  cancelRequestedAt: Date | null;
};

/** The customer asked to cancel a scheduled visit and nobody has handled it yet. */
export const cancelPending = (r: Row) => !!r.cancelRequestedAt && !OPEN_EXCLUDED.includes(r.status as RequestStatus);

/** A moment's date on this device, as YYYY-MM-DD. */
const localDay = (d: Date) => new Intl.DateTimeFormat("en-CA").format(d);

export function inView(view: QueueView, r: Row) {
  const status = r.status as RequestStatus;
  switch (view) {
    case "open":
      return !OPEN_EXCLUDED.includes(status);
    case "needsAction":
      return NEEDS_SPECIALIST.includes(status) || cancelPending(r);
    case "waitingCustomer":
      return status === "quote_ready";
    case "inProgress":
      return status === "scheduled" || status === "in_progress";
    case "doneToday":
      return status === "completed" && localDay(new Date(r.updatedAt)) === todayHere();
    case "completed":
    case "cancelled":
      return status === view;
    case "all":
      return true;
  }
}

/** How long a request has been waiting on the specialist, e.g. "3 h" / "2 d". */
export function waitingFor(updatedAt: Date, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(updatedAt).getTime()) / 60000));
  if (minutes < 60) return { label: `${minutes} min`, hours: 0 };
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return { label: `${hours} h`, hours };
  return { label: `${Math.floor(hours / 24)} d`, hours };
}
