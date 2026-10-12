/** tel: link with only the characters dialers accept. */
export function telLink(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** WhatsApp wants the number in international form, digits only (numbers are saved with their country code). */
export function whatsappLink(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return `https://wa.me/${digits}`;
}
