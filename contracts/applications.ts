// Technician application options, shared by the public form and the dashboard.
import type { LocalText } from "./services";
import { PHOTO_TYPES } from "./uploads";

export const EXPERIENCE_LEVELS = ["lt1", "1-3", "3-5", "5-10", "10+"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const EXPERIENCE_LABELS: Record<ExperienceLevel, LocalText> = {
  lt1: { en: "Under 1 year", ar: "أقل من سنة" },
  "1-3": { en: "1–3 years", ar: "١–٣ سنوات" },
  "3-5": { en: "3–5 years", ar: "٣–٥ سنوات" },
  "5-10": { en: "5–10 years", ar: "٥–١٠ سنوات" },
  "10+": { en: "10+ years", ar: "+١٠ سنوات" },
};

export const AVAILABILITY = ["full_time", "part_time", "weekends"] as const;
export type Availability = (typeof AVAILABILITY)[number];

export const AVAILABILITY_LABELS: Record<Availability, LocalText> = {
  full_time: { en: "Full time", ar: "دوام كامل" },
  part_time: { en: "Part time", ar: "دوام جزئي" },
  weekends: { en: "Weekends only", ar: "عطلة نهاية الأسبوع فقط" },
};

/** Whether the technician works on their own or for a company (required; a company needs its name). */
export const WORK_MODES = ["independent", "company"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const WORK_MODE_LABELS: Record<WorkMode, LocalText> = {
  independent: { en: "On my own", ar: "بمفردي" },
  company: { en: "With a company", ar: "مع شركة" },
};

/** The same, as staff read it about someone else. */
export const WORK_MODE_STAFF_LABELS: Record<WorkMode, LocalText> = {
  independent: { en: "On their own", ar: "بمفرده" },
  company: { en: "With a company", ar: "مع شركة" },
};

/** How the technician gets to jobs (required on the application). */
export const TRANSPORT = ["none", "motorcycle", "car", "van", "truck"] as const;
export type Transport = (typeof TRANSPORT)[number];

export const TRANSPORT_LABELS: Record<Transport, LocalText> = {
  none: { en: "No transport", ar: "لا توجد وسيلة نقل" },
  motorcycle: { en: "Motorcycle", ar: "دراجة نارية" },
  car: { en: "Car", ar: "سيارة" },
  van: { en: "Van / pick-up", ar: "شاحنة صغيرة / بيك آب" },
  truck: { en: "Truck", ar: "شاحنة" },
};

/** Documents a technician applicant uploads, in the order the form shows them. */
export const APPLICATION_DOCUMENTS = ["photo", "idDocument", "proofOfAddress", "criminalRecord", "vehicleRegistration"] as const;
export type ApplicationDocument = (typeof APPLICATION_DOCUMENTS)[number];

/**
 * Private papers: only admins see them (step 1 of the review). Specialists, who make the
 * final decision (step 2), see the application's details and the profile photo.
 */
export const PRIVATE_DOCUMENTS = ["idDocument", "proofOfAddress", "criminalRecord", "vehicleRegistration"] as const;

/** Where each document's storage key is kept on an application (db/schema.ts). */
export const DOCUMENT_FIELD = {
  idDocument: "idDocumentKey",
  criminalRecord: "criminalRecordKey",
  proofOfAddress: "proofOfAddressKey",
  vehicleRegistration: "vehicleRegistrationKey",
  photo: "photoKey",
} as const satisfies Record<ApplicationDocument, string>;
export type DocumentField = (typeof DOCUMENT_FIELD)[ApplicationDocument];

/** The photo must be an image; the others may be a photo or a PDF scan. */
/** A photo (never SVG, see contracts/uploads.ts) or, for papers, a PDF. */
const PAPER_TYPES = [...PHOTO_TYPES, "application/pdf"] as const;
export const DOCUMENT_TYPES: Record<ApplicationDocument, readonly string[]> = {
  idDocument: PAPER_TYPES,
  criminalRecord: PAPER_TYPES,
  proofOfAddress: PAPER_TYPES,
  vehicleRegistration: PAPER_TYPES,
  photo: PHOTO_TYPES,
};

/**
 * The documents an applicant must provide: the vehicle's registration papers only when they
 * work with a vehicle. Applications from before the transport question (null) weren't asked.
 */
export function requiredDocuments(transport: Transport | null | undefined): ApplicationDocument[] {
  return APPLICATION_DOCUMENTS.filter((kind) => kind !== "vehicleRegistration" || (!!transport && transport !== "none"));
}
/** Largest file accepted per document (photos are shrunk in the browser before this check). */
export const MAX_DOCUMENT_MB = 10;
export const MAX_DOCUMENT_BYTES = MAX_DOCUMENT_MB * 1024 * 1024;

export function isAllowedDocumentType(kind: ApplicationDocument, contentType: string) {
  return DOCUMENT_TYPES[kind].includes(contentType.toLowerCase());
}

/** Statuses a specialist sets by hand; "hired" only comes from the Hire action. */
export const MANUAL_APPLICATION_STATUSES = ["new", "contacted", "rejected"] as const;
