// Notification emails: who hears about what, in English and Arabic.
// Called by the routers after a change has been saved. A failed email is logged and
// never undoes or blocks the change itself.
import { and, count, eq, inArray } from "drizzle-orm";
import { requestEvents, serviceRequests, technicianApplications, users } from "@db/schema";
import { CATEGORY_MAP, URGENCY_META, type LocalText, type UrgencyLevel } from "@contracts/services";
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

async function send(to: (string | null | undefined)[], message: Message) {
  const recipients = [...new Set(to.filter((e): e is string => !!e).map((e) => e.toLowerCase()))];
  if (recipients.length) await sendEmail({ to: recipients, ...render(message) });
}

/** Runs a notification without ever failing the caller. */
async function safely(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    console.error(`[notify] ${name} failed`, error);
  }
}

/* ---------- data ---------- */

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
    db.query.users.findFirst({ where: eq(users.id, request.userId) }),
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
    new Intl.DateTimeFormat(lang === "ar" ? "ar-LB" : "en-GB", {
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
    urgency: local(URGENCY_META[(r.urgencyFinal ?? r.urgencySuggested) as UrgencyLevel]?.label, r.urgencySuggested),
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
        title: both("A new request needs review", "في طلب جديد بحاجة مراجعة"),
        lines: [
          both(
            `${job.customer?.name ?? "A customer"} booked ${d.category.en} in ${d.area} for ${d.when.en}.`,
            `${job.customer?.name ?? "عميل"} حجز ${d.category.ar} ب${d.area} ليوم ${d.when.ar}.`,
          ),
          both(`Suggested urgency: ${d.urgency.en}.`, `الاستعجال المقترح: ${d.urgency.ar}.`),
        ],
        path: "/dashboard",
        button: both("Open the dashboard", "افتح لوحة التحكم"),
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
        title: revised ? both("Your price was updated", "تحدّث السعر") : both("Your price is ready", "السعر جاهز"),
        lines: [
          both(
            `Our specialist reviewed your ${d.category.en} request. Price: ${amount}.`,
            `المختص راجع طلب ${d.category.ar} تبعك. السعر: ${amount}.`,
          ),
          ...(job.request.quoteNote ? [both(job.request.quoteNote, job.request.quoteNote)] : []),
          both(
            "Approve it to book the visit. Nothing is charged without your approval.",
            "وافق عليه لنحجز الزيارة. ما في شي بينحسب بلا موافقتك.",
          ),
        ],
        path: "/requests",
        button: both("See and approve", "شوف ووافق"),
      });
    }),

  /** Customer approved the price: specialists assign and schedule. */
  quoteApproved: (id: number) =>
    safely("quoteApproved", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      const amount = `$${job.request.quoteAmount}`;
      await send(await specialistEmails(), {
        subject: both(`Price approved for #${d.id}: assign a technician`, `انوافق على سعر #${d.id}: عيّن فني`),
        title: both("The customer approved the price", "العميل وافق عالسعر"),
        lines: [
          both(
            `Request #${d.id} (${d.category.en}, ${d.area}) was approved at ${amount}. Assign a technician and schedule the visit for ${d.when.en}.`,
            `الطلب #${d.id} (${d.category.ar}، ${d.area}) انوافق عليه بـ ${amount}. عيّن فني وحدّد الزيارة ليوم ${d.when.ar}.`,
          ),
        ],
        path: "/dashboard",
        button: both("Open the dashboard", "افتح لوحة التحكم"),
      });
    }),

  /** Customer cancelled before the visit was scheduled. */
  customerCancelled: (id: number) =>
    safely("customerCancelled", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      const line = both(
        `The customer cancelled request #${d.id} (${d.category.en}, ${d.area}).`,
        `العميل لغى الطلب #${d.id} (${d.category.ar}، ${d.area}).`,
      );
      await send(await specialistEmails(), {
        subject: both(`Request #${d.id} cancelled by the customer`, `العميل لغى الطلب #${d.id}`),
        title: both("A request was cancelled", "انلغى طلب"),
        lines: [line],
        path: "/dashboard",
        button: both("Open the dashboard", "افتح لوحة التحكم"),
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
        subject: both(`Customer asked to cancel #${d.id}`, `العميل طلب يلغي #${d.id}`),
        title: both("A customer asked to cancel their visit", "عميل طلب يلغي زيارته"),
        lines: [
          both(
            `Request #${d.id} (${d.category.en}, ${d.area}) is scheduled for ${d.when.en}.`,
            `الطلب #${d.id} (${d.category.ar}، ${d.area}) محدّد ليوم ${d.when.ar}.`,
          ),
          ...(reason ? [both(`Their reason: ${reason}`, `السبب: ${reason}`)] : []),
          both(
            "Confirm with them and the technician, then cancel it on the dashboard.",
            "أكّد معه ومع الفني، وبعدين الغيه من لوحة التحكم.",
          ),
        ],
        path: "/dashboard",
        button: both("Open the dashboard", "افتح لوحة التحكم"),
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
          title: both("You have a new job", "عندك مهمة جديدة"),
          lines: [
            both(`${d.category.en} in ${d.area}, ${d.when.en}.`, `${d.category.ar} ب${d.area}، ${d.when.ar}.`),
            both(
              "The address, photos and the specialist's notes are in your jobs.",
              "العنوان والصور وملاحظات المختص موجودين بمهامك.",
            ),
          ],
          path: "/tech",
          button: both("Open my jobs", "افتح مهامي"),
        });
      }
      if (previousTechnicianId && previousTechnicianId !== job.technician?.id) {
        const previous = await getDb().query.users.findFirst({ where: eq(users.id, previousTechnicianId) });
        await send([previous?.email], {
          subject: both(`Job #${d.id} was reassigned`, `المهمة #${d.id} انعطت لفني تاني`),
          title: both("A job was given to another technician", "مهمة انعطت لفني تاني"),
          lines: [
            both(
              `Job #${d.id} (${d.category.en}, ${d.area}) is no longer in your jobs. No need to go.`,
              `المهمة #${d.id} (${d.category.ar}، ${d.area}) ما عادت بمهامك. ما في داعي تروح.`,
            ),
          ],
          path: "/tech",
          button: both("Open my jobs", "افتح مهامي"),
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
          ...(techName ? [both(`Your technician: ${techName}.`, `الفني تبعك: ${techName}.`)] : []),
          both(
            "When they're on the way, you can follow them on the map in your requests.",
            "لما يكون بالطريق، فيك تتابعه عالخريطة بطلباتك.",
          ),
        ],
        path: "/requests",
        button: both("See my request", "شوف طلبي"),
      });
      await send([job.technician?.email], {
        subject: both(`Job #${d.id} scheduled: ${d.when.en}`, `المهمة #${d.id} محدّدة: ${d.when.ar}`),
        title: both("Your job is scheduled", "مهمتك محدّدة"),
        lines: [both(`${d.category.en} in ${d.area}, ${d.when.en}.`, `${d.category.ar} ب${d.area}، ${d.when.ar}.`)],
        path: "/tech",
        button: both("Open my jobs", "افتح مهامي"),
      });
    }),

  /** Job done: the customer is told how to report a problem under the guarantee. */
  completed: (id: number) =>
    safely("completed", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      await send([job.customer?.email], {
        subject: both(`Job #${d.id} is done`, `المهمة #${d.id} خلصت`),
        title: both("Your job is done", "شغلك خلص"),
        lines: [
          both(`Your ${d.category.en} job is complete. Thank you for choosing Be Right.`, `شغل ${d.category.ar} خلص. شكراً لأنك اخترت بي رايت.`),
          both(
            `If anything isn't right within ${WORKMANSHIP_GUARANTEE_DAYS} days, reply to this email and we'll come back to make it right.`,
            `إذا في شي مش مزبوط خلال ${arabicDays(WORKMANSHIP_GUARANTEE_DAYS)}، رد على هالإيميل ومنرجع منصلّحه.`,
          ),
        ],
        path: "/requests",
        button: both("See my request", "شوف طلبي"),
      });
    }),

  /** Our team cancelled the request. */
  closedByUs: (id: number) =>
    safely("closedByUs", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      await send([job.customer?.email], {
        subject: both(`Request #${d.id} was cancelled`, `انلغى الطلب #${d.id}`),
        title: both("Your request was cancelled", "انلغى طلبك"),
        lines: [
          both(
            `Our team cancelled your ${d.category.en} request #${d.id}. If you didn't expect this, reply to this email.`,
            `فريقنا لغى طلب ${d.category.ar} #${d.id}. إذا ما كنت متوقّع هالشي، رد على هالإيميل.`,
          ),
        ],
        path: "/requests",
        button: both("See my requests", "شوف طلباتي"),
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
        no_work: both("no repair was done at the visit", "ما صار تصليح بالزيارة"),
        no_access: both("nobody was there at the agreed time", "ما كان في حدا بالموعد المتفق عليه"),
        late_cancel: both("the visit was cancelled after the technician set off", "الزيارة تلغت بعد ما المعلّم طلع"),
      }[job.request.visitFeeReason ?? "no_work"];
      await send([job.customer?.email], {
        subject: both(`Request #${d.id} closed with a ${fee} visit fee`, `تسكّر الطلب #${d.id} مع رسم زيارة ${fee}`),
        title: both("Your request was closed", "تسكّر طلبك"),
        lines: [
          both(
            `Our team closed your ${d.category.en} request #${d.id} because ${why.en}. Only the ${fee} visit fee applies.`,
            `فريقنا سكّر طلب ${d.category.ar} #${d.id} لأنه ${why.ar}. بس رسم الزيارة ${fee} بيتطبّق.`,
          ),
          both("If something isn't right, reply to this email.", "إذا في شي مش مظبوط، رد على هالإيميل."),
        ],
        path: "/requests",
        button: both("See my requests", "شوف طلباتي"),
      });
      if (job.technician) await send([job.technician.email], jobCancelled(d.id));
    }),

  /** The technician reported a visit without a repair: a specialist decides about the visit fee. */
  visitReported: (id: number, note: string) =>
    safely("visitReported", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      await send(await specialistEmails(), {
        subject: both(`Job #${d.id}: the technician reported a visit without a repair`, `المهمة #${d.id}: المعلّم بلّغ عن زيارة بلا تصليح`),
        title: both("A visit needs your decision", "في زيارة بدها قرارك"),
        lines: [
          both(`${job.technician?.name ?? "The technician"}: ${note}`, `${job.technician?.name ?? "المعلّم"}: ${note}`),
          both(
            "Open the job to close it with the visit fee, or keep it going.",
            "افتح المهمة لتسكّرها مع رسم الزيارة، أو كمّل فيها.",
          ),
        ],
        path: "/dashboard",
        button: both("Open the dashboard", "افتح لوحة التحكم"),
      });
    }),

  /** Customer reported a problem with a completed job (workmanship guarantee). */
  guaranteeReported: (id: number) =>
    safely("guaranteeReported", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      const originalId = job.request.guaranteeFor;
      await send(await specialistEmails(), {
        subject: both(`Guarantee claim #${d.id} on job #${originalId}`, `مطالبة ضمان #${d.id} عالمهمة #${originalId}`),
        title: both("A customer reported a problem after a job", "عميل بلّغ عن مشكلة بعد مهمة"),
        lines: [
          both(
            `${job.customer?.name ?? "A customer"} says job #${originalId} (${d.category.en}, ${d.area}) isn't right.`,
            `${job.customer?.name ?? "عميل"} بيقول إنو المهمة #${originalId} (${d.category.ar}، ${d.area}) مش مزبوطة.`,
          ),
          ...(job.request.notes ? [both(`"${job.request.notes}"`, `«${job.request.notes}»`)] : []),
          both(
            `Review it, then confirm a free return visit or send a price if it isn't covered. Preferred day: ${d.when.en}.`,
            `راجعها، وبعدين أكّد زيارة مجانية أو ابعت سعر إذا مش مشمولة. اليوم المفضّل: ${d.when.ar}.`,
          ),
        ],
        path: "/dashboard",
        button: both("Open the dashboard", "افتح لوحة التحكم"),
      });
    }),

  /** The guarantee claim is covered: the customer is told the return visit is free. */
  guaranteeAccepted: (id: number) =>
    safely("guaranteeAccepted", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      await send([job.customer?.email], {
        subject: both(`We'll come back for free: request #${d.id}`, `منرجع ببلاش: الطلب #${d.id}`),
        title: both("Your return visit is free", "زيارتك الجاية ببلاش"),
        lines: [
          both(
            `This is covered by our ${WORKMANSHIP_GUARANTEE_DAYS}-day guarantee, so there's nothing to pay. We'll confirm the date and technician shortly.`,
            `هالشي مشمول بضمانة الـ${arabicDays(WORKMANSHIP_GUARANTEE_DAYS)}، فما في شي تدفعه. منأكّدلك الموعد والمعلّم قريباً.`,
          ),
        ],
        path: "/requests",
        button: both("See my request", "شوف طلبي"),
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
        subject: both("Server errors on Be Right", "أخطاء عالسيرفر ببي رايت"),
        title: both("Something went wrong on the server", "صار خطأ عالسيرفر"),
        lines: [
          both(
            `An unexpected error happened while handling "${path}". There may be more: you get at most one of these emails an hour.`,
            `صار خطأ مش متوقع وقت معالجة "${path}". ممكن يكون في غيره: بيوصلك إيميل واحد متل هيدا بالساعة كحد أقصى.`,
          ),
          both(
            "The details are in Netlify: Logs, Functions, api.",
            "التفاصيل بـNetlify: Logs، Functions، api.",
          ),
        ],
        path: "/admin",
        button: both("Open the admin area", "افتح الإدارة"),
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
        title: both("Someone applied to work with us", "في حدا قدّم ليشتغل معنا"),
        lines: [
          both(`${app.name}: ${trade.en}, ${app.area}.`, `${app.name}: ${trade.ar}، ${app.area}.`),
          both(
            "Check the application and its documents, then approve it for the specialists.",
            "راجع الطلب ومستنداته، وبعدين وافق عليه للمختصين.",
          ),
        ],
        path: "/admin?tab=applications",
        button: both("Review the application", "راجع الطلب"),
      });
    }),

  /** An admin approved an application: the specialists make the final decision (step 2 of 2). */
  applicationApproved: (applicationId: number) =>
    safely("applicationApproved", async () => {
      const app = await getDb().query.technicianApplications.findFirst({
        where: eq(technicianApplications.id, applicationId),
      });
      if (!app) return;
      const trade = local(CATEGORY_MAP[app.trade]?.name, app.trade);
      await send(await emailsOf("specialist"), {
        subject: both(`Approved applicant to contact: ${app.name}`, `متقدّم موافق عليه للتواصل: ${app.name}`),
        title: both("An applicant is ready for you", "في متقدّم جاهز إلك"),
        lines: [
          both(`${app.name}: ${trade.en}, ${app.area}.`, `${app.name}: ${trade.ar}، ${app.area}.`),
          both("An admin checked the documents. Contact them, then hire or reject.", "الإدارة راجعت المستندات. تواصل معهم، وبعدين وظّف أو ارفض."),
        ],
        path: "/dashboard?tab=applications",
        button: both("Open the application", "افتح الطلب"),
      });
    }),
};

function jobCancelled(id: number): Message {
  return {
    subject: both(`Job #${id} was cancelled`, `انلغت المهمة #${id}`),
    title: both("A job was cancelled", "انلغت مهمة"),
    lines: [both(`Job #${id} was cancelled. No need to go.`, `المهمة #${id} انلغت. ما في داعي تروح.`)],
    path: "/tech",
    button: both("Open my jobs", "افتح مهامي"),
  };
}
