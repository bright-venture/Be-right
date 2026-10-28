// Notifications about a request, from booking to the guarantee.

import { and, count, eq } from "drizzle-orm";
import { requestEvents, users } from "@db/schema";
import { arabicDays, WORKMANSHIP_GUARANTEE_DAYS } from "@contracts/legal";
import { getDb } from "../queries/connection";
import { sendPush } from "../lib/push";
import { type Message, both, send } from "./email";
import { describe, loadJob, safely, specialistEmails, staffFor, tell } from "./people";

function jobCancelled(id: number): Message {
  return {
    subject: both(`Job #${id} was cancelled`, `أُلغيت المهمة #${id}`),
    title: both("A job was cancelled", "أُلغيت مهمة"),
    lines: [both(`Job #${id} was cancelled. No need to go.`, `أُلغيت المهمة #${id}. لا داعي للذهاب.`)],
    path: "/tech",
    button: both("Open my jobs", "فتح مهامي"),
  };
}

/** A request's life: booked, priced, approved, assigned, visited, closed, guarantee. */
export const requestNotifications = {
  /** Customer booked: specialists review it. */
  requestSubmitted: (id: number) =>
    safely("requestSubmitted", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      await tell(await staffFor(job.request.category), {
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
      }, { path: "/dashboard" });
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
      await tell([job.customer], {
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
      }, { path: `/requests/${d.id}` });
    }),

  /** Customer approved the price: specialists assign and schedule. */
  quoteApproved: (id: number) =>
    safely("quoteApproved", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      const amount = `$${job.request.quoteAmount}`;
      await send(await specialistEmails(job.request.category), {
        subject: both(`Price approved for #${d.id}: assign ${d.worker.en.a}`, `تمت الموافقة على سعر الطلب #${d.id}: أسند المهمة إلى ${d.worker.ar.one}`),
        title: both("The customer approved the price", "وافق العميل على السعر"),
        lines: [
          both(
            `Request #${d.id} (${d.category.en}, ${d.area}) was approved at ${amount}. Assign ${d.worker.en.a} and schedule the visit for ${d.when.en}.`,
            `تمت الموافقة على الطلب #${d.id} (${d.category.ar}، ${d.area}) بمبلغ ${amount}. أسند المهمة إلى ${d.worker.ar.one} وحدّد موعد الزيارة ليوم ${d.when.ar}.`,
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
      await send(await specialistEmails(job.request.category), {
        subject: both(`Request #${d.id} cancelled by the customer`, `ألغى العميل الطلب #${d.id}`),
        title: both("A request was cancelled", "تم إلغاء طلب"),
        lines: [line],
        path: "/dashboard",
        button: both("Open the dashboard", "فتح لوحة التحكم"),
      });
      if (job.technician) await tell([job.technician], jobCancelled(d.id), { path: "/tech" });
    }),

  /** Customer asked to cancel a scheduled visit: a specialist calls and confirms. */
  cancelRequested: (id: number) =>
    safely("cancelRequested", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      const reason = job.request.cancelReason;
      await send(await specialistEmails(job.request.category), {
        subject: both(`Customer asked to cancel #${d.id}`, `طلب العميل إلغاء #${d.id}`),
        title: both("A customer asked to cancel their visit", "طلب عميل إلغاء زيارته"),
        lines: [
          both(
            `Request #${d.id} (${d.category.en}, ${d.area}) is scheduled for ${d.when.en}.`,
            `الطلب #${d.id} (${d.category.ar}، ${d.area}) محدّد ليوم ${d.when.ar}.`,
          ),
          ...(reason ? [both(`Their reason: ${reason}`, `السبب: ${reason}`)] : []),
          both(
            `Confirm with them and the ${d.worker.en.word}, then cancel it on the dashboard.`,
            `تأكّد منه ومن ${d.worker.ar.the}، ثم ألغِه من لوحة التحكم.`,
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
        await tell([job.technician], {
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
        }, { path: `/tech?job=${d.id}` });
      }
      if (previousTechnicianId && previousTechnicianId !== job.technician?.id) {
        const previous = await getDb().query.users.findFirst({ where: eq(users.id, previousTechnicianId) });
        await tell([previous], {
          subject: both(`Job #${d.id} was reassigned`, `أُسندت المهمة #${d.id} إلى مهني آخر`),
          title: both("A job was given to another professional", "أُسندت مهمة إلى مهني آخر"),
          lines: [
            both(
              `Job #${d.id} (${d.category.en}, ${d.area}) is no longer in your jobs. No need to go.`,
              `لم تعد المهمة #${d.id} (${d.category.ar}، ${d.area}) ضمن مهامك. لا داعي للذهاب.`,
            ),
          ],
          path: "/tech",
          button: both("Open my jobs", "فتح مهامي"),
        }, { path: "/tech" });
      }
    }),

  /** Visit scheduled: the customer gets the confirmation, the technician the date. */
  scheduled: (id: number) =>
    safely("scheduled", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      const techName = job.technician?.name;
      await tell([job.customer], {
        subject: both(`Your visit is booked: ${d.when.en}`, `زيارتك محجوزة: ${d.when.ar}`),
        title: both("Your visit is booked", "زيارتك محجوزة"),
        lines: [
          both(`${d.category.en}, ${d.when.en}.`, `${d.category.ar}، ${d.when.ar}.`),
          ...(techName ? [both(`Your ${d.worker.en.word}: ${techName}.`, `${d.worker.ar.the} المكلّف: ${techName}.`)] : []),
          both(
            "When they're on the way, you can follow them on the map in your requests.",
            "عندما يكون في الطريق، يمكنك متابعته على الخريطة في صفحة طلباتك.",
          ),
        ],
        path: "/requests",
        button: both("See my request", "عرض طلبي"),
      }, { path: `/requests/${d.id}` });
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
      await tell([job.customer], {
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
      }, { path: `/requests/${d.id}` });
    }),

  /** Our team cancelled the request. */
  closedByUs: (id: number) =>
    safely("closedByUs", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      await tell([job.customer], {
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
      }, { path: `/requests/${d.id}` });
      if (job.technician) await tell([job.technician], jobCancelled(d.id), { path: "/tech" });
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
        late_cancel: both(`the visit was cancelled after the ${d.worker.en.word} set off`, `أُلغيت الزيارة بعد انطلاق ${d.worker.ar.the}`),
      }[job.request.visitFeeReason ?? "no_work"];
      await tell([job.customer], {
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
      }, { path: `/requests/${d.id}` });
      if (job.technician) await tell([job.technician], jobCancelled(d.id), { path: "/tech" });
    }),

  /** The technician reported a visit without a repair: a specialist decides about the visit fee. */
  visitReported: (id: number, note: string) =>
    safely("visitReported", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      await send(await specialistEmails(job.request.category), {
        subject: both(`Job #${d.id}: the ${d.worker.en.word} reported a visit without a repair`, `المهمة #${d.id}: أبلغ ${d.worker.ar.the} عن زيارة دون إصلاح`),
        title: both("A visit needs your decision", "زيارة بحاجة إلى قرارك"),
        lines: [
          both(`${job.technician?.name ?? d.worker.en.title}: ${note}`, `${job.technician?.name ?? d.worker.ar.the}: ${note}`),
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
      await send(await specialistEmails(job.request.category), {
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
            `This is covered by our ${WORKMANSHIP_GUARANTEE_DAYS}-day guarantee, so there's nothing to pay. We'll confirm the date and the ${d.worker.en.word} shortly.`,
            `هذا مشمول بضمان الـ${arabicDays(WORKMANSHIP_GUARANTEE_DAYS)}، فلا شيء عليك دفعه. سنؤكّد لك الموعد و${d.worker.ar.the} قريباً.`,
          ),
        ],
        path: "/requests",
        button: both("See my request", "عرض طلبي"),
      });
    }),

  /** The professional set off (their first position for the job): the customer follows them. Phone only. */
  onTheWay: (id: number) =>
    safely("onTheWay", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      await sendPush([job.customer?.id], {
        title: both(`Your ${d.worker.en.word} is on the way`, `${d.worker.ar.the} في الطريق إليك`),
        body: both(`${d.category.en}: follow them on the map.`, `${d.category.ar}: تابعه على الخريطة.`),
        path: `/requests/${d.id}`,
      });
    }),

  /** The professional pressed Arrived. Phone only. */
  arrived: (id: number) =>
    safely("arrived", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      await sendPush([job.customer?.id], {
        title: both(`Your ${d.worker.en.word} has arrived`, `وصل ${d.worker.ar.the}`),
        body: both(`${d.category.en}, request #${d.id}.`, `${d.category.ar}، الطلب #${d.id}.`),
        path: `/requests/${d.id}`,
      });
    }),
};
