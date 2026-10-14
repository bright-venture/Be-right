import { env } from "./env";

export type Email = { to: string[]; subject: string; html: string; text: string };

let warnedDisabled = false;

/**
 * Sends one email through Resend's API: true once Resend took it, false when emails are off
 * (no RESEND_API_KEY). Throws if Resend refuses or doesn't answer in time.
 */
export async function sendEmail(email: Email): Promise<boolean> {
  if (!email.to.length) return false;
  if (!env.resendApiKey) {
    if (!warnedDisabled && process.env.NODE_ENV !== "test") {
      console.info("[email] RESEND_API_KEY is not set: notification emails are skipped.");
    }
    warnedDisabled = true;
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.resendApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.emailFrom,
      to: email.to,
      reply_to: env.emailReplyTo,
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Resend answered ${res.status}: ${await res.text()}`);
  return true;
}
