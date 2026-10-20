import {
  pgTable,
  pgEnum,
  serial,
  integer,
  bigint,
  varchar,
  text,
  timestamp,
  uuid,
  index,
  boolean,
  doublePrecision,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { MediaKind, VisitFeeReason } from "../contracts/workflow";
import type { AuditAction, AuditDetails } from "../contracts/audit";
import type { DocumentsDeclared, Transport, WorkMode } from "../contracts/applications";
import type { EmergencyStatus } from "../contracts/emergency";

// Every table enables Row Level Security with no policies. The app server talks to
// Postgres directly (bypassing RLS), while Supabase's public REST API — reachable with
// the browser's publishable key — gets no access to these tables at all.

export const userRole = pgEnum("user_role", ["customer", "specialist", "technician", "admin"]);
export const requestStatus = pgEnum("request_status", [
  "submitted",
  "in_review",
  "quote_ready",
  "approved",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);
export const applicationStatus = pgEnum("application_status", [
  "new",
  "contacted",
  "hired",
  "rejected",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  /** Supabase auth.users.id */
  authId: uuid("auth_id").notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  /** Given at sign-up; pre-fills bookings. */
  phone: varchar("phone", { length: 64 }),
  /** When this account accepted the Terms and Privacy Policy, and which version. */
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  termsVersion: varchar("terms_version", { length: 32 }),
  avatar: text("avatar"),
  role: userRole("role").default("customer").notNull(),
  /** The customer deleted their account: personal details were erased (see auth.deleteAccount). */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps,
  lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
}).enableRLS();

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const serviceRequests = pgTable(
  "service_requests",
  {
    id: serial("id").primaryKey(),
    /** The customer's account; empty for an emergency sent to someone without one. */
    userId: integer("user_id").references(() => users.id),
    /** The customer's name when there is no account (emergencies). */
    contactName: varchar("contact_name", { length: 255 }),
    /** Sent from the Emergency button: price agreed on the phone, technician sent at once. */
    emergency: boolean("emergency").default(false).notNull(),
    technicianId: integer("technician_id").references(() => users.id),
    category: varchar("category", { length: 64 }).notNull(),
    answers: text("answers").notNull(), // JSON: Record<string, string>
    status: requestStatus("status").default("submitted").notNull(),
    preferredDate: varchar("preferred_date", { length: 32 }).notNull(),
    timeSlot: varchar("time_slot", { length: 32 }).notNull(),
    area: varchar("area", { length: 255 }).notNull(),
    address: text("address").notNull(),
    /** Map pin dropped by the customer (required for new requests). */
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    phone: varchar("phone", { length: 64 }).notNull(),
    notes: text("notes"),
    quoteAmount: varchar("quote_amount", { length: 32 }),
    quoteNote: text("quote_note"),
    /** Specialist's job preparation, shown on the technician's job card. */
    prepDiagnosis: text("prep_diagnosis"),
    prepTools: text("prep_tools"),
    prepParts: text("prep_parts"),
    prepInstructions: text("prep_instructions"),
    preparedAt: timestamp("prepared_at", { withTimezone: true }),
    /** The customer asked to cancel a scheduled visit; a specialist confirms it. */
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    /** Visit fee in USD, fixed when booked (null for guarantee visits and older requests). */
    visitFee: varchar("visit_fee", { length: 16 }),
    /** Set when a specialist closed the job charging only the visit fee, and why. */
    visitFeeReason: varchar("visit_fee_reason", { length: 32 }).$type<VisitFeeReason>(),
    /** A return visit under the workmanship guarantee: the completed request it's about. */
    guaranteeFor: integer("guarantee_for").references((): AnyPgColumn => serviceRequests.id),
    ...timestamps,
  },
  (t) => [
    index("service_requests_user_idx").on(t.userId),
    index("service_requests_technician_idx").on(t.technicianId),
    // The dashboard queue and the admin lists sort by newest first.
    index("service_requests_created_idx").on(t.createdAt),
    // The dashboard asks every 30 seconds whether anything changed (latest update).
    index("service_requests_updated_idx").on(t.updatedAt),
  ],
).enableRLS();

export type ServiceRequest = typeof serviceRequests.$inferSelect;

export const requestMedia = pgTable(
  "request_media",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => serviceRequests.id, { onDelete: "cascade" }),
    /** Object path inside the Supabase Storage bucket */
    key: varchar("key", { length: 512 }).notNull().unique(),
    fileName: varchar("file_name", { length: 512 }).notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    contentType: varchar("content_type", { length: 128 }),
    /** "customer" (booking, problem report) or the technician's "before" / "after" job photos. */
    kind: varchar("kind", { length: 16 }).$type<MediaKind>().default("customer").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("request_media_request_idx").on(t.requestId)],
).enableRLS();

export const requestEvents = pgTable(
  "request_events",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => serviceRequests.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 }).notNull(),
    note: text("note"),
    actorId: integer("actor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("request_events_request_idx").on(t.requestId),
    // Admin → Activity sorts every event by time.
    index("request_events_created_idx").on(t.createdAt),
  ],
).enableRLS();

/** Public "apply as a technician" submissions (no login required). */
export const technicianApplications = pgTable("technician_applications", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 64 }).notNull(),
  trade: varchar("trade", { length: 64 }).notNull(),
  /** Older applications only, like experience, availability, tools, work mode, notes and the papers below. */
  area: varchar("area", { length: 255 }),
  notes: text("notes"),
  /** Contact + login email; required for new applications (older ones may lack it). */
  email: varchar("email", { length: 320 }),
  /** See contracts/applications.ts for the allowed values. */
  experience: varchar("experience", { length: 16 }),
  availability: varchar("availability", { length: 16 }),
  hasTools: boolean("has_tools"),
  hasTransport: boolean("has_transport"),
  /** Motorcycle, car, van, truck, or none (applications from before this was asked: null). */
  transport: varchar("transport", { length: 16 }).$type<Transport>(),
  /** Private storage keys (technician-docs bucket); required for new applications. */
  idDocumentKey: varchar("id_document_key", { length: 512 }),
  criminalRecordKey: varchar("criminal_record_key", { length: 512 }),
  proofOfAddressKey: varchar("proof_of_address_key", { length: 512 }),
  /** The vehicle's registration papers (only when the applicant works with a vehicle). */
  vehicleRegistrationKey: varchar("vehicle_registration_key", { length: 512 }),
  photoKey: varchar("photo_key", { length: 512 }),
  /** Whether the applicant has each paper to bring to the office (see contracts/applications.ts). */
  documentsDeclared: jsonb("documents_declared").$type<DocumentsDeclared>(),
  /** Applicant consented to the Privacy Policy and document review (version accepted). */
  consentAt: timestamp("consent_at", { withTimezone: true }),
  consentVersion: varchar("consent_version", { length: 32 }),
  /** Set when marked rejected; documents are deleted a fixed period after (Privacy Policy). */
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  documentsDeletedAt: timestamp("documents_deleted_at", { withTimezone: true }),
  status: applicationStatus("status").default("new").notNull(),
  /** The technician account created or promoted when the applicant was hired. */
  hiredUserId: integer("hired_user_id").references(() => users.id),
  /** "independent" or "company" (null on applications from before the question). */
  workMode: varchar("work_mode", { length: 16 }).$type<WorkMode>(),
  /** The company's name, when they work with one. */
  companyName: varchar("company_name", { length: 255 }),
  /** The in-person meeting at the office an admin booked with the applicant (before approving). */
  meetingAt: timestamp("meeting_at", { withTimezone: true }),
  meetingPlace: varchar("meeting_place", { length: 200 }),
  meetingNote: text("meeting_note"),
  /** The time zone the meeting was booked in (the admin's), for the applicant's email. */
  meetingTimeZone: varchar("meeting_time_zone", { length: 64 }),
  /** When and by which admin the applicant was approved, which adds them to the technicians. */
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: integer("approved_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export type TechnicianApplication = typeof technicianApplications.$inferSelect;

/** A customer's rating of a completed job: one per request (see server/reviews-router.ts). */
export const reviews = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .unique()
      .references(() => serviceRequests.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    /** Who did the job, so their average can be shown. */
    technicianId: integer("technician_id").references(() => users.id),
    category: varchar("category", { length: 64 }).notNull(),
    /** 1 to 5 stars. */
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("reviews_technician_idx").on(t.technicianId)],
).enableRLS();

export type Review = typeof reviews.$inferSelect;

/** Request counters for abuse-prone endpoints, one row per key (see server/lib/rateLimit.ts). */
export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 128 }).primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
}).enableRLS();

/** Latest known technician position per request (one row per request). */
export const technicianLocations = pgTable("technician_locations", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id")
    .notNull()
    .unique()
    .references(() => serviceRequests.id, { onDelete: "cascade" }),
  technicianId: integer("technician_id")
    .notNull()
    .references(() => users.id),
  lat: varchar("lat", { length: 32 }).notNull(),
  lng: varchar("lng", { length: 32 }).notNull(),
  accuracy: varchar("accuracy", { length: 16 }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
}).enableRLS();

/**
 * Staff actions and access to applicants' documents: who did what, to whom, and when
 * (see contracts/audit.ts). Rows are only ever added, never changed.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 48 }).$type<AuditAction>().notNull(),
    /** The account it was done to (a staff member, a hired or removed technician). */
    targetUserId: integer("target_user_id").references(() => users.id, { onDelete: "set null" }),
    /** The technician application it was about. */
    applicationId: integer("application_id").references(() => technicianApplications.id, { onDelete: "set null" }),
    details: jsonb("details").$type<AuditDetails>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt)],
).enableRLS();

/**
 * Priority dispatch: an emergency a customer sent (what's wrong and where) before calling the
 * emergency line. The specialist who answers opens it, adds the rest and sends a technician
 * (requestId: the job it became), or dismisses it. Deleted after EMERGENCY_RETENTION_DAYS
 * (contracts/emergency.ts), and with the customer's account.
 */
export const emergencyRequests = pgTable(
  "emergency_requests",
  {
    id: serial("id").primaryKey(),
    /** Signed-in customer, if any. */
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    /** One of EMERGENCY_PROBLEMS. */
    problem: varchar("problem", { length: 64 }).notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    /** Where to reach the customer. Older emergencies have address details instead. */
    phone: varchar("phone", { length: 32 }),
    address: text("address"),
    status: varchar("status", { length: 16 }).$type<EmergencyStatus>().default("open").notNull(),
    requestId: integer("request_id").references(() => serviceRequests.id, { onDelete: "set null" }),
    handledBy: integer("handled_by").references(() => users.id, { onDelete: "set null" }),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("emergency_requests_created_idx").on(t.createdAt)],
).enableRLS();

/**
 * Partner spare-parts shops (Admin → Parts shops). Be Right has a written agreement with
 * each: a technician picks up a part for free and Be Right pays the shop at the end of the
 * month, outside the app. The app only shows technicians where the shops are.
 */
export const partsShops = pgTable("parts_shops", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 64 }).notNull(),
  address: text("address").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  /** The trades it supplies (service ids); empty = every trade. */
  trades: jsonb("trades").$type<string[]>().default([]).notNull(),
  /** Opening hours as the shop gives them, e.g. "Mon–Sat 8:00–18:00". */
  hours: varchar("hours", { length: 255 }),
  /** For technicians: who to ask, what to show. */
  note: text("note"),
  /** Off: hidden from technicians (agreement paused or ended), kept on record. */
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

export type PartsShop = typeof partsShops.$inferSelect;
