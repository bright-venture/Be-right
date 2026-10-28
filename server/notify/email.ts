// How a notification email looks: a heading and lines in English and Arabic, and a button.

import { type LocalText } from "@contracts/services";
import { env } from "../lib/env";
import { sendEmail } from "../lib/email";

export type Lang = "en" | "ar";

type Text = Record<Lang, string>;

/** One notification: a heading and a few lines per language, plus a button. */
export type Message = {
  subject: Text;
  title: Text;
  lines: Text[];
  /** Page the button opens, e.g. "/requests". */
  path: string;
  button: Text;
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function render(m: Message) {
  const url = `${env.siteUrl}${m.path}`;
  const block = (lang: Lang) => {
    const rtl = lang === "ar";
    return `
            <tr>
              <td dir="${rtl ? "rtl" : "ltr"}" style="padding:${rtl ? "0 28px 8px;border-top:1px solid #e5ded2" : "8px 28px 0"};text-align:${rtl ? "right" : "left"};">
                <h${rtl ? 2 : 1} style="margin:${rtl ? "20px 0 8px;font-size:20px" : "0 0 8px;font-size:22px"};">${esc(m.title[lang])}</h${rtl ? 2 : 1}>
                ${m.lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:${rtl ? 1.7 : 1.5};">${esc(l[lang])}</p>`).join("")}
                <p style="margin:12px 0 24px;" align="center">
                  <a href="${esc(url)}" style="display:inline-block;background:#F45309;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 28px;border-radius:999px;">${esc(m.button[lang])}</a>
                </p>
              </td>
            </tr>`;
  };
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#EDE7DC;font-family:Arial,Helvetica,sans-serif;color:#0C2B5C;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDE7DC;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:2px solid #0C2B5C;border-radius:24px;">
            <tr>
              <td style="padding:28px 28px 8px;" align="center">
                <img src="${esc(env.siteUrl)}/assets/wordmark.png" width="140" alt="Be Right" style="display:block;border:0;" />
              </td>
            </tr>${block("en")}${block("ar")}
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#4a5f80;">Be Right by Bright · be-rightbright.com</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  const text = (["en", "ar"] as const)
    .map((lang) => [m.title[lang], ...m.lines.map((l) => l[lang]), `${m.button[lang]}: ${url}`].join("\n\n"))
    .join("\n\n----------\n\n");
  // Area names etc. are typed by people: keep the subject on one line.
  const subject = `${m.subject.en} · ${m.subject.ar}`.replace(/\s+/g, " ").trim();
  return { subject, html, text };
}

/** Whether the email went out (false: nobody to send to, or emails are off). */
export async function send(to: (string | null | undefined)[], message: Message) {
  const recipients = [...new Set(to.filter((e): e is string => !!e).map((e) => e.toLowerCase()))];
  return recipients.length ? (await sendEmail({ to: recipients, ...render(message) })) === true : false;
}

export const both = (en: string, ar: string): Text => ({ en, ar });

export const local = (text: LocalText | undefined, fallback: string): Text => text ?? { en: fallback, ar: fallback };

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
