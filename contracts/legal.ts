// Company details and document versions used by the Terms, Privacy Policy and sign-up.
// TODO before launch: replace the bracketed values with Bright's registered details.

export const COMPANY = {
  brand: "Be Right by Bright",
  legalName: "[Company legal name, as registered in Lebanon]",
  address: "[Registered address], Lebanon",
  email: "hello@be-rightbright.com",
  privacyEmail: "privacy@be-rightbright.com",
  website: "be-rightbright.com",
  /**
   * Business WhatsApp in international digits, e.g. "96170123456". Empty: every
   * "WhatsApp us" button on the site stays hidden.
   */
  whatsapp: "",
} as const;

/**
 * Bump when the Terms or Privacy Policy change materially; accounts record the
 * version they accepted, so you can ask for re-acceptance later.
 */
export const LEGAL_VERSION = "2026-10-07";

/**
 * Days a customer has to report a problem with completed work ("we come back").
 * Also written out in index.html (social preview text), which can't read this setting.
 */
/** The visit fee (minimum charge) in USD: rules in contracts/workflow.ts. */
export const VISIT_FEE_USD = 10;

export const WORKMANSHIP_GUARANTEE_DAYS = 7;

/** Days after a rejected application before its documents are deleted. */
export const REJECTED_APPLICATION_RETENTION_DAYS = 90;

/** 7 → "٧". */
export function arabicDigits(n: number) {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

/** A number of days in Arabic, with the right noun form: يوم، يومين، ٧ أيام، ٣٠ يوماً. */
export function arabicDays(n: number) {
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومين";
  if (n >= 3 && n <= 10) return `${arabicDigits(n)} أيام`;
  return `${arabicDigits(n)} يوماً`;
}
