// The audit trail (Admin → Activity → Staff actions): what staff did, to whom, and when.
// Request history has its own log (request_events); this covers people and documents.

export const AUDIT_ACTIONS = [
  /** Someone was given a staff role (details: email, role, invited). */
  "staff_added",
  /** A staff member's role changed; "customer" means they left the team (details: from, to). */
  "staff_role_changed",
  /** A staff member's two-step login was removed so they can set it up again (details: removed). */
  "two_step_reset",
  /** An applicant's documents (ID, criminal record, …) were opened. */
  "documents_viewed",
  /** An admin approved an application (step 1 of 2), so specialists can now hire or reject it. */
  "application_approved",
  /** An application's status was changed by hand (details: from, to). */
  "application_status",
  /** An applicant was hired as a technician (details: invited). */
  "technician_hired",
  /** A technician went back to a regular account (details: unassigned). */
  "technician_removed",
  /**
   * A staff area refused someone (details: reason, path): "password" when the session didn't
   * start with a password, "role" when the account isn't staff. Not recorded: sessions still
   * waiting for their two-step code, which is a normal step of every staff sign-in.
   */
  "staff_access_refused",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Small facts about an action, shown with it (never documents, passwords or tokens). */
export type AuditDetails = Record<string, string | number | boolean | null>;
