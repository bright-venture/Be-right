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
