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
  /** An admin booked (or moved) the in-person meeting with an applicant (details: at, place, rescheduled). */
  "meeting_booked",
  /** Older entries, from when approving and hiring were two separate steps. */
  "application_approved",
  /** An application's status was changed by hand (details: from, to). */
  "application_status",
  /** An applicant was hired as a technician (details: invited). */
  "technician_hired",
  /** A technician went back to a regular account (details: unassigned). */
  "technician_removed",
  /** A specialist or admin deleted their own account (details: role). Their name is erased. */
  "staff_account_deleted",
  /** An admin changed the price table (Admin → Prices). */
  "prices_changed",
  /** Older entries, from when admins set a technician's starting point (details: transport). */
  "technician_base_set",
  /** An admin changed how a technician travels (details: transport). */
  "technician_transport_set",
  /** An admin changed the districts a technician works in (details: districts). */
  "technician_districts_set",
  /** An admin gave a service to a specialist, or back to the admins (details: service; target: the specialist). */
  "service_specialist_set",
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
