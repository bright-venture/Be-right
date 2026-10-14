// Phone / WhatsApp numbers typed by customers and applicants. Shared by the forms and the API.

/**
 * An international number: + (or 00) and the country code, then 7 to 15 digits in all
 * (E.164); spaces, dashes, dots and brackets allowed. Without the country code a number can't
 * be called or opened in WhatsApp from another country.
 */
export function isValidPhone(value: string) {
  const v = value.trim();
  if (!/^(\+|00)[\d\s\-().]+$/.test(v)) return false;
  const digits = v.replace(/\D/g, "").replace(/^00/, "").length;
  return digits >= 7 && digits <= 15;
}

/** Country codes offered in front of a phone field. Lebanon for now; more lines to come. */
export const PHONE_COUNTRIES = [
  /** 7 or 8 digits once the 0 is dropped: 1 234 567 (landline), 3 123 456, 71 123 456. */
  { id: "LB", dial: "+961", name: { en: "Lebanon", ar: "لبنان" }, digits: [7, 8] },
] as const;
export type PhoneCountry = (typeof PHONE_COUNTRIES)[number]["id"];
export const DEFAULT_PHONE_COUNTRY: PhoneCountry = "LB";

/**
 * The full number from the chosen country code and the number as typed: the local leading 0
 * goes (03 123 456 → +961 3 123 456), and a number typed with its own + or 00 is kept as is.
 */
export function joinPhone(country: PhoneCountry, local: string) {
  const typed = local.trim();
  if (!typed) return "";
  if (/^(\+|00)/.test(typed)) return typed;
  const dial = PHONE_COUNTRIES.find((c) => c.id === country)?.dial ?? "";
  return `${dial} ${typed.replace(/^0+/, "")}`;
}

/** A number typed after the country code, the right length for that country (or a full international one). */
export function isValidLocalPhone(country: PhoneCountry, local: string) {
  const full = joinPhone(country, local);
  if (!isValidPhone(full)) return false;
  if (/^(\+|00)/.test(local.trim())) return true;
  const [min, max] = PHONE_COUNTRIES.find((c) => c.id === country)?.digits ?? [1, 15];
  const n = local.replace(/\D/g, "").replace(/^0+/, "").length;
  return n >= min && n <= max;
}
