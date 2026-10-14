// Notification emails: who hears about what, in English and Arabic.
// Called by the routers after a change has been saved. A failed email is logged and
// never undoes or blocks the change itself.
import { and, count, eq, inArray } from "drizzle-orm";
import { emergencyRequests, requestEvents, serviceRequests, technicianApplications, users } from "@db/schema";
import { EMERGENCY_PROBLEM_MAP } from "@contracts/emergency";
import { directionsLinks } from "@contracts/geo";
import { CATEGORY_MAP, type LocalText } from "@contracts/services";
import { arabicDays, WORKMANSHIP_GUARANTEE_DAYS } from "@contracts/legal";
import { t } from "@contracts/i18n";
import { getDb } from "./queries/connection";
import { env } from "./lib/env";
import { sendEmail } from "./lib/email";

type Lang = "en" | "ar";
type Text = Record<Lang, string>;

/** One notification: a heading and a few lines per language, plus a button. */
type Message = {
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
async function send(to: (string | null | undefined)[], message: Message) {
  const recipients = [...new Set(to.filter((e): e is string => !!e).map((e) => e.toLowerCase()))];
  return recipients.length ? (await sendEmail({ to: recipients, ...render(message) })) === true : false;
}

/** Runs a notification without ever failing the caller (undefined if it failed). */
async function safely<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[notify] ${name} failed`, error);
    return undefined;
  }
}

/* ---------- data ---------- */

/** A meeting's date and time in the time zone it was booked in, with that zone shown. */
function meetingTime(at: Date, timeZone: string | null): Text {
  const format = (locale: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: timeZone ?? "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(at);
  return { en: format("en-GB"), ar: format("ar") };
}

/** Everyone with one role (admins, or specialists only). */
async function emailsOf(role: "admin" | "specialist") {
  const rows = await getDb().select({ email: users.email }).from(users).where(eq(users.role, role));
  return rows.map((r) => r.email);
}

async function specialistEmails() {
  const rows = await getDb()
    .select({ email: users.email })
    .from(users)
    .where(inArray(users.role, ["specialist", "admin"]));
  return rows.map((r) => r.email);
}

async function loadJob(id: number) {
  const db = getDb();
  const request = await db.query.serviceRequests.findFirst({ where: eq(serviceRequests.id, id) });
  if (!request) throw new Error(`Request ${id} not found`);
  const [customer, technician] = await Promise.all([
    request.userId ? db.query.users.findFirst({ where: eq(users.id, request.userId) }) : undefined,
    request.technicianId ? db.query.users.findFirst({ where: eq(users.id, request.technicianId) }) : undefined,
  ]);
  return { request, customer, technician };
}

type Job = Awaited<ReturnType<typeof loadJob>>;

const both = (en: string, ar: string): Text => ({ en, ar });
const local = (text: LocalText | undefined, fallback: string): Text => text ?? { en: fallback, ar: fallback };

function describe(job: Job) {
  const r = job.request;
  const day = (lang: Lang) =>
    new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${r.preferredDate}T00:00:00Z`));
  const slots: Record<string, LocalText> = {
    morning: t.book.slotMorning,
    afternoon: t.book.slotAfternoon,
    evening: t.book.slotEvening,
  };
  const slot = local(slots[r.timeSlot], r.timeSlot);
  return {
    id: r.id,
    category: local(CATEGORY_MAP[r.category]?.name, r.category),
    area: r.area,
    when: both(`${day("en")}, ${slot.en}`, `${day("ar")}، ${slot.ar}`),
  };
}

/* ---------- notifications ---------- */

export const notify = {
  /** Customer booked: specialists review it. */
  requestSubmitted: (id: number) =>
    safely("requestSubmitted", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      await send(await specialistEmails(), {
        subject: both(`New request #${d.id}: ${d.category.en}, ${d.area}`, `طلب جديد #${d.id}: ${d.category.ar}، ${d.area}`),
        title: both("A new request needs review", "يوجد طلب جديد بحاجة إلى مراجعة"),
        lines: [
          both(
            `${job.customer?.name ?? "A customer"} booked ${d.category.en} in ${d.area} for ${d.when.en}.`,
            `حجز ${job.customer?.name ?? "عميل"} خدمة ${d.category.ar} في ${d.area} ليوم ${d.when.ar}.`,
          ),
        ],
        path: "/dashboard",
        button: both("Open the dashboard", "فتح لوحة التحكم"),
      });
    }),

  /** Specialist sent (or changed) the price: the customer approves it. */
  quoteSent: (id: number) =>
    safely("quoteSent", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      const [{ quotes }] = await getDb()
        .select({ quotes: count() })
        .from(requestEvents)
        .where(and(eq(requestEvents.requestId, id), eq(requestEvents.status, "quote_ready")));
      const revised = quotes > 1;
      const amount = `$${job.request.quoteAmount}`;
      await send([job.customer?.email], {
        subject: revised
          ? both(`Updated price for request #${d.id}`, `سعر محدّث للطلب #${d.id}`)
          : both(`Your price for request #${d.id} is ready`, `سعر طلبك #${d.id} جاهز`),
        title: revised ? both("Your price was updated", "تم تحديث السعر") : both("Your price is ready", "السعر جاهز"),
        lines: [
          both(
            `Our specialist reviewed your ${d.category.en} request. Price: ${amount}.`,
            `راجع المختص طلب ${d.category.ar} الخاص بك. السعر: ${amount}.`,
          ),
          ...(job.request.quoteNote ? [both(job.request.quoteNote, job.request.quoteNote)] : []),
          both(
            "Approve it to book the visit. Nothing is charged without your approval.",
            "وافق عليه لنحجز الزيارة. لا يُحتسب أي شيء دون موافقتك.",
          ),
        ],
        path: "/requests",
        button: both("See and approve", "مراجعة وموافقة"),
      });
    }),

  /** Customer approved the price: specialists assign and schedule. */
  quoteApproved: (id: number) =>
    safely("quoteApproved", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      const amount = `$${job.request.quoteAmount}`;
      await send(await specialistEmails(), {
        subject: both(`Price approved for #${d.id}: assign a technician`, `تمت الموافقة على سعر الطلب #${d.id}: أسند فنّياً`),
        title: both("The customer approved the price", "وافق العميل على السعر"),
        lines: [
          both(
            `Request #${d.id} (${d.category.en}, ${d.area}) was approved at ${amount}. Assign a technician and schedule the visit for ${d.when.en}.`,
            `تمت الموافقة على الطلب #${d.id} (${d.category.ar}، ${d.area}) بمبلغ ${amount}. أسند فنّياً وحدّد موعد الزيارة ليوم ${d.when.ar}.`,
          ),
        ],
        path: "/dashboard",
        button: both("Open the dashboard", "فتح لوحة التحكم"),
      });
    }),

  /** Customer cancelled before the visit was scheduled. */
  customerCancelled: (id: number) =>
    safely("customerCancelled", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      const line = both(
        `The customer cancelled request #${d.id} (${d.category.en}, ${d.area}).`,
        `ألغى العميل الطلب #${d.id} (${d.category.ar}، ${d.area}).`,
      );
      await send(await specialistEmails(), {
        subject: both(`Request #${d.id} cancelled by the customer`, `ألغى العميل الطلب #${d.id}`),
        title: both("A request was cancelled", "تم إلغاء طلب"),
        lines: [line],
        path: "/dashboard",
        button: both("Open the dashboard", "فتح لوحة التحكم"),
      });
      if (job.technician) await send([job.technician.email], jobCancelled(d.id));
    }),

  /** Customer asked to cancel a scheduled visit: a specialist calls and confirms. */
  cancelRequested: (id: number) =>
    safely("cancelRequested", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      const reason = job.request.cancelReason;
      await send(await specialistEmails(), {
        subject: both(`Customer asked to cancel #${d.id}`, `طلب العميل إلغاء #${d.id}`),
        title: both("A customer asked to cancel their visit", "طلب عميل إلغاء زيارته"),
        lines: [
          both(
            `Request #${d.id} (${d.category.en}, ${d.area}) is scheduled for ${d.when.en}.`,
            `الطلب #${d.id} (${d.category.ar}، ${d.area}) محدّد ليوم ${d.when.ar}.`,
          ),
          ...(reason ? [both(`Their reason: ${reason}`, `السبب: ${reason}`)] : []),
          both(
            "Confirm with them and the technician, then cancel it on the dashboard.",
            "تأكّد منه ومن الفنّي، ثم ألغِه من لوحة التحكم.",
          ),
        ],
        path: "/dashboard",
        button: both("Open the dashboard", "فتح لوحة التحكم"),
      });
    }),

  /** A technician got a job, and the one it was taken from (if any) is told. */
  assigned: (id: number, previousTechnicianId: number | null) =>
    safely("assigned", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      if (job.technician && previousTechnicianId !== job.technician.id) {
        await send([job.technician.email], {
          subject: both(`New job #${d.id}: ${d.category.en}, ${d.area}`, `مهمة جديدة #${d.id}: ${d.category.ar}، ${d.area}`),
          title: both("You have a new job", "لديك مهمة جديدة"),
          lines: [
            both(`${d.category.en} in ${d.area}, ${d.when.en}.`, `${d.category.ar} في ${d.area}، ${d.when.ar}.`),
            both(
              "The address, photos and the specialist's notes are in your jobs.",
              "العنوان والصور وملاحظات المختص موجودة في مهامك.",
            ),
          ],
          path: "/tech",
          button: both("Open my jobs", "فتح مهامي"),
        });
      }
      if (previousTechnicianId && previousTechnicianId !== job.technician?.id) {
        const previous = await getDb().query.users.findFirst({ where: eq(users.id, previousTechnicianId) });
        await send([previous?.email], {
          subject: both(`Job #${d.id} was reassigned`, `أُسندت المهمة #${d.id} إلى فنّي آخر`),
          title: both("A job was given to another technician", "أُسندت مهمة إلى فنّي آخر"),
          lines: [
            both(
              `Job #${d.id} (${d.category.en}, ${d.area}) is no longer in your jobs. No need to go.`,
              `لم تعد المهمة #${d.id} (${d.category.ar}، ${d.area}) ضمن مهامك. لا داعي للذهاب.`,
            ),
          ],
          path: "/tech",
          button: both("Open my jobs", "فتح مهامي"),
        });
      }
    }),

  /** Visit scheduled: the customer gets the confirmation, the technician the date. */
  scheduled: (id: number) =>
    safely("scheduled", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      const techName = job.technician?.name;
      await send([job.customer?.email], {
        subject: both(`Your visit is booked: ${d.when.en}`, `زيارتك محجوزة: ${d.when.ar}`),
        title: both("Your visit is booked", "زيارتك محجوزة"),
        lines: [
          both(`${d.category.en}, ${d.when.en}.`, `${d.category.ar}، ${d.when.ar}.`),
          ...(techName ? [both(`Your technician: ${techName}.`, `الفنّي المكلّف: ${techName}.`)] : []),
          both(
            "When they're on the way, you can follow them on the map in your requests.",
            "عندما يكون في الطريق، يمكنك متابعته على الخريطة في صفحة طلباتك.",
          ),
        ],
        path: "/requests",
        button: both("See my request", "عرض طلبي"),
      });
      await send([job.technician?.email], {
        subject: both(`Job #${d.id} scheduled: ${d.when.en}`, `المهمة #${d.id} محدّدة: ${d.when.ar}`),
        title: both("Your job is scheduled", "مهمتك محدّدة"),
        lines: [both(`${d.category.en} in ${d.area}, ${d.when.en}.`, `${d.category.ar} في ${d.area}، ${d.when.ar}.`)],
        path: "/tech",
        button: both("Open my jobs", "فتح مهامي"),
      });
    }),

  /** Job done: the customer is told how to report a problem under the guarantee. */
  completed: (id: number) =>
    safely("completed", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      await send([job.customer?.email], {
        subject: both(`Job #${d.id} is done`, `اكتملت المهمة #${d.id}`),
        title: both("Your job is done", "اكتمل العمل"),
        lines: [
          both(`Your ${d.category.en} job is complete. Thank you for choosing Be Right.`, `اكتمل عمل ${d.category.ar}. شكراً لاختيارك بي رايت.`),
          both(
            `If anything isn't right within ${WORKMANSHIP_GUARANTEE_DAYS} days, reply to this email and we'll come back to make it right.`,
            `إذا لم يكن شيء ما على ما يرام خلال ${arabicDays(WORKMANSHIP_GUARANTEE_DAYS)}، ردّ على هذا البريد وسنعود لإصلاحه.`,
          ),
        ],
        path: "/requests",
        button: both("See my request", "عرض طلبي"),
      });
    }),

  /** Our team cancelled the request. */
  closedByUs: (id: number) =>
    safely("closedByUs", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      await send([job.customer?.email], {
        subject: both(`Request #${d.id} was cancelled`, `أُلغي الطلب #${d.id}`),
        title: both("Your request was cancelled", "أُلغي طلبك"),
        lines: [
          both(
            `Our team cancelled your ${d.category.en} request #${d.id}. If you didn't expect this, reply to this email.`,
            `ألغى فريقنا طلب ${d.category.ar} #${d.id}. إذا لم تكن تتوقع ذلك، ردّ على هذا البريد.`,
          ),
        ],
        path: "/requests",
        button: both("See my requests", "عرض طلباتي"),
      });
      if (job.technician) await send([job.technician.email], jobCancelled(d.id));
    }),

  /** A specialist closed the job charging only the visit fee (no repair happened). */
  visitFeeCharged: (id: number) =>
    safely("visitFeeCharged", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      const fee = `$${job.request.visitFee}`;
      const why = {
        no_work: both("no repair was done at the visit", "لم يتم إصلاح خلال الزيارة"),
        no_access: both("nobody was there at the agreed time", "لم يكن أحد موجوداً في الموعد المتفق عليه"),
        late_cancel: both("the visit was cancelled after the technician set off", "أُلغيت الزيارة بعد انطلاق الفنّي"),
      }[job.request.visitFeeReason ?? "no_work"];
      await send([job.customer?.email], {
        subject: both(`Request #${d.id} closed with a ${fee} visit fee`, `أُغلق الطلب #${d.id} مع رسوم زيارة ${fee}`),
        title: both("Your request was closed", "أُغلق طلبك"),
        lines: [
          both(
            `Our team closed your ${d.category.en} request #${d.id} because ${why.en}. Only the ${fee} visit fee applies.`,
            `أغلق فريقنا طلب ${d.category.ar} #${d.id} لأنه ${why.ar}. تُطبَّق رسوم الزيارة ${fee} فقط.`,
          ),
          both("If something isn't right, reply to this email.", "إذا كان هناك خطأ ما، ردّ على هذا البريد."),
        ],
        path: "/requests",
        button: both("See my requests", "عرض طلباتي"),
      });
      if (job.technician) await send([job.technician.email], jobCancelled(d.id));
    }),

  /** The technician reported a visit without a repair: a specialist decides about the visit fee. */
  visitReported: (id: number, note: string) =>
    safely("visitReported", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      await send(await specialistEmails(), {
        subject: both(`Job #${d.id}: the technician reported a visit without a repair`, `المهمة #${d.id}: أبلغ الفنّي عن زيارة دون إصلاح`),
        title: both("A visit needs your decision", "زيارة بحاجة إلى قرارك"),
        lines: [
          both(`${job.technician?.name ?? "The technician"}: ${note}`, `${job.technician?.name ?? "الفنّي"}: ${note}`),
          both(
            "Open the job to close it with the visit fee, or keep it going.",
            "افتح المهمة لإغلاقها مع رسوم الزيارة، أو لمتابعتها.",
          ),
        ],
        path: "/dashboard",
        button: both("Open the dashboard", "فتح لوحة التحكم"),
      });
    }),

  /** Customer reported a problem with a completed job (workmanship guarantee). */
  guaranteeReported: (id: number) =>
    safely("guaranteeReported", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      const originalId = job.request.guaranteeFor;
      await send(await specialistEmails(), {
        subject: both(`Guarantee claim #${d.id} on job #${originalId}`, `مطالبة ضمان #${d.id} على المهمة #${originalId}`),
        title: both("A customer reported a problem after a job", "أبلغ عميل عن مشكلة بعد مهمة"),
        lines: [
          both(
            `${job.customer?.name ?? "A customer"} says job #${originalId} (${d.category.en}, ${d.area}) isn't right.`,
            `يقول ${job.customer?.name ?? "عميل"} إن المهمة #${originalId} (${d.category.ar}، ${d.area}) لم تُنجز بشكل صحيح.`,
          ),
          ...(job.request.notes ? [both(`"${job.request.notes}"`, `«${job.request.notes}»`)] : []),
          both(
            `Review it, then confirm a free return visit or send a price if it isn't covered. Preferred day: ${d.when.en}.`,
            `راجعها، ثم أكّد زيارة مجانية أو أرسل سعراً إذا لم تكن مشمولة. اليوم المفضّل: ${d.when.ar}.`,
          ),
        ],
        path: "/dashboard",
        button: both("Open the dashboard", "فتح لوحة التحكم"),
      });
    }),

  /** The guarantee claim is covered: the customer is told the return visit is free. */
  guaranteeAccepted: (id: number) =>
    safely("guaranteeAccepted", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      await send([job.customer?.email], {
        subject: both(`We'll come back for free: request #${d.id}`, `زيارة مجانية: الطلب #${d.id}`),
        title: both("Your return visit is free", "زيارتك القادمة مجانية"),
        lines: [
          both(
            `This is covered by our ${WORKMANSHIP_GUARANTEE_DAYS}-day guarantee, so there's nothing to pay. We'll confirm the date and technician shortly.`,
            `هذا مشمول بضمان الـ${arabicDays(WORKMANSHIP_GUARANTEE_DAYS)}، فلا شيء عليك دفعه. سنؤكّد لك الموعد والفنّي قريباً.`,
          ),
        ],
        path: "/requests",
        button: both("See my request", "عرض طلبي"),
      });
    }),

  /**
   * Server errors happened: tell the admins (at most hourly, see lib/alerts.ts). Sent to the
   * ADMIN_EMAILS setting too, in case the database itself is what's failing.
   */
  serverError: (path: string) =>
    safely("serverError", async () => {
      let admins: (string | null)[] = [];
      try {
        const rows = await getDb().select({ email: users.email }).from(users).where(eq(users.role, "admin"));
        admins = rows.map((r) => r.email);
      } catch {
        // The database may be the problem: the ADMIN_EMAILS setting still gets the email.
      }
      await send([...(env.adminEmails ?? []), ...admins], {
        subject: both("Server errors on Be Right", "أخطاء في خادم بي رايت"),
        title: both("Something went wrong on the server", "حدث خطأ في الخادم"),
        lines: [
          both(
            `An unexpected error happened while handling "${path}". There may be more: you get at most one of these emails an hour.`,
            `حدث خطأ غير متوقع أثناء معالجة "${path}". قد توجد أخطاء أخرى: تصلك رسالة واحدة كهذه في الساعة كحد أقصى.`,
          ),
          both(
            "The details are in Netlify: Logs, Functions, api.",
            "التفاصيل في Netlify: Logs، Functions، api.",
          ),
        ],
        path: "/admin",
        button: both("Open the admin area", "فتح الإدارة"),
      });
    }),

  /** Someone applied to work as a technician: the admins review it first (step 1 of 2). */
  applicationSubmitted: (applicationId: number) =>
    safely("applicationSubmitted", async () => {
      const app = await getDb().query.technicianApplications.findFirst({
        where: eq(technicianApplications.id, applicationId),
      });
      if (!app) return;
      const trade = local(CATEGORY_MAP[app.trade]?.name, app.trade);
      await send(await emailsOf("admin"), {
        subject: both(`New technician application: ${app.name}`, `طلب توظيف فني جديد: ${app.name}`),
        title: both("Someone applied to work with us", "تقدّم شخص للعمل معنا"),
        lines: [
          both(`${app.name}: ${trade.en}, ${app.area}.`, `${app.name}: ${trade.ar}، ${app.area}.`),
          both(
            "Check the application and its documents, book an in-person meeting, then approve it.",
            "راجع الطلب ومستنداته، واحجز مقابلة، ثم وافق عليه.",
          ),
        ],
        path: "/admin?tab=applications",
        button: both("Review the application", "راجع الطلب"),
      });
    }),

  /** The applicant's in-person meeting at the office: when and where (or its new time). Whether it was emailed. */
  meetingBooked: (applicationId: number, rescheduled: boolean) =>
    safely("meetingBooked", async () => {
      const app = await getDb().query.technicianApplications.findFirst({
        where: eq(technicianApplications.id, applicationId),
      });
      if (!app?.email || !app.meetingAt || !app.meetingPlace) return false;
      const trade = local(CATEGORY_MAP[app.trade]?.name, app.trade);
      const when = meetingTime(app.meetingAt, app.meetingTimeZone);
      return send([app.email], {
        subject: rescheduled
          ? both("New time for your meeting with Be Right", "موعد جديد لمقابلتك مع بي رايت")
          : both("Your meeting with Be Right", "مقابلتك مع بي رايت"),
        title: rescheduled
          ? both("Your meeting has a new time", "تم تحديد موعد جديد لمقابلتك")
          : both("Let's meet in person", "لنلتقِ شخصياً"),
        lines: [
          both(
            `Thanks for applying to work with Be Right (${trade.en}). We'd like to meet you in person.`,
            `شكراً على تقديمك للعمل مع بي رايت (${trade.ar}). نودّ أن نلتقي بك شخصياً.`,
          ),
          both(`When: ${when.en}`, `الموعد: ${when.ar}`),
          both(`Where: ${app.meetingPlace}`, `المكان: ${app.meetingPlace}`),
          ...(app.meetingNote ? [both(app.meetingNote, app.meetingNote)] : []),
          both(
            "If this time doesn't work for you, reply to this email and we'll find another one.",
            "إذا لم يناسبك هذا الموعد، ردّ على هذا البريد وسنجد موعداً آخر.",
          ),
        ],
        path: "/",
        button: both("Visit Be Right", "زيارة بي رايت"),
      });
    }),

  /** An admin approved an applicant: the specialists have a new technician to assign jobs to. */
  technicianJoined: (applicationId: number) =>
    safely("technicianJoined", async () => {
      const app = await getDb().query.technicianApplications.findFirst({
        where: eq(technicianApplications.id, applicationId),
      });
      if (!app) return;
      const trade = local(CATEGORY_MAP[app.trade]?.name, app.trade);
      await send(await emailsOf("specialist"), {
        subject: both(`New technician on the team: ${app.name}`, `فنّي جديد في الفريق: ${app.name}`),
        title: both("A new technician joined", "انضمّ فنّي جديد"),
        lines: [
          both(`${app.name}: ${trade.en}, ${app.area}.`, `${app.name}: ${trade.ar}، ${app.area}.`),
          both("An admin met them and approved them. You can now assign them jobs.", "قابلته الإدارة ووافقت عليه. يمكنك الآن إسناد المهام إليه."),
        ],
        path: "/dashboard?tab=technicians",
        button: both("See the technicians", "عرض الفنيين"),
      });
    }),

  /** The specialist added the customer's details to an emergency job: the technician can call them. */
  emergencyDetails: (id: number) =>
    safely("emergencyDetails", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      const who = [job.request.contactName, job.request.phone].filter(Boolean).join(", ");
      if (!who) return;
      await send([job.technician?.email], {
        subject: both(`Emergency job #${d.id}: customer's contact`, `مهمة طارئة #${d.id}: بيانات العميل`),
        title: both("The customer's contact", "بيانات التواصل مع العميل"),
        lines: [both(`Emergency job #${d.id} (${d.category.en}): ${who}.`, `المهمة الطارئة #${d.id} (${d.category.ar}): ${who}.`)],
        path: "/tech",
        button: both("Open my jobs", "فتح مهامي"),
      });
    }),

  /** A customer sent an emergency (priority dispatch) and is calling the emergency line. */
  emergencyReported: (id: number) =>
    safely("emergencyReported", async () => {
      const sent = await getDb().query.emergencyRequests.findFirst({ where: eq(emergencyRequests.id, id) });
      if (!sent) return;
      const problem = local(EMERGENCY_PROBLEM_MAP[sent.problem]?.label, sent.problem);
      const map = directionsLinks(sent.lat, sent.lng).google;
      await send(await specialistEmails(), {
        subject: both(`Emergency: ${problem.en}`, `طوارئ: ${problem.ar}`),
        title: both("An emergency is coming in", "حالة طوارئ واردة"),
        lines: [
          both(
            `${problem.en}. The customer is calling the emergency line now.`,
            `${problem.ar}. يتصل العميل بخط الطوارئ الآن.`,
          ),
          ...(sent.phone ? [both(`Phone: ${sent.phone}.`, `الهاتف: ${sent.phone}.`)] : []),
          ...(sent.address ? [both(`Address: ${sent.address}.`, `العنوان: ${sent.address}.`)] : []),
          both(`Map: ${map}`, `الخريطة: ${map}`),
        ],
        path: "/dashboard?tab=emergencies",
        button: both("Open emergencies", "فتح حالات الطوارئ"),
      });
    }),

  /** A specialist sent a technician to an emergency: they go now; a signed-in customer is told. */
  emergencyDispatched: (id: number) =>
    safely("emergencyDispatched", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      const contact = job.request.contactName;
      await send([job.technician?.email], {
        subject: both(`Emergency job #${d.id}: ${d.category.en}, ${d.area}`, `مهمة طارئة #${d.id}: ${d.category.ar}، ${d.area}`),
        title: both("Emergency: please go now", "حالة طارئة: يُرجى التوجّه الآن"),
        lines: [
          both(`${d.category.en} in ${d.area}. The price was agreed with the customer on the phone.`, `${d.category.ar} في ${d.area}. تم الاتفاق على السعر مع العميل عبر الهاتف.`),
          both(
            `The address, the map and the customer's number${contact ? ` (${contact})` : ""} are in your jobs.`,
            `العنوان والخريطة ورقم العميل${contact ? ` (${contact})` : ""} موجودة في مهامك.`,
          ),
        ],
        path: "/tech",
        button: both("Open my jobs", "فتح مهامي"),
      });
      const techName = job.technician?.name;
      await send([job.customer?.email], {
        subject: both("A technician is on the way", "فنّي في الطريق إليك"),
        title: both("Help is on the way", "المساعدة في الطريق"),
        lines: [
          both(`${d.category.en}: we're sending a technician now.`, `${d.category.ar}: نرسل إليك فنّياً الآن.`),
          ...(techName ? [both(`Your technician: ${techName}.`, `الفنّي المكلّف: ${techName}.`)] : []),
          both(
            "When they're on the way, you can follow them on the map in your requests.",
            "عندما يكون في الطريق، يمكنك متابعته على الخريطة في صفحة طلباتك.",
          ),
        ],
        path: "/requests",
        button: both("See my request", "عرض طلبي"),
      });
    }),
};

function jobCancelled(id: number): Message {
  return {
    subject: both(`Job #${id} was cancelled`, `أُلغيت المهمة #${id}`),
    title: both("A job was cancelled", "أُلغيت مهمة"),
    lines: [both(`Job #${id} was cancelled. No need to go.`, `أُلغيت المهمة #${id}. لا داعي للذهاب.`)],
    path: "/tech",
    button: both("Open my jobs", "فتح مهامي"),
  };
}
