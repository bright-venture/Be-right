// Notifications about emergencies.

import { eq } from "drizzle-orm";
import { emergencyRequests } from "@db/schema";
import { answerLines, EMERGENCY_PROBLEM_MAP } from "@contracts/emergency";
import { directionsLinks } from "@contracts/geo";
import { getDb } from "../queries/connection";
import { describe, loadJob, safely, staffFor, tell } from "./people";
import { both, cap, local } from "./email";

/** Emergencies: reported, a professional sent, the customer's details added. */
export const emergencyNotifications = {
  /** The specialist added the customer's details to an emergency job: the technician can call them. */
  emergencyDetails: (id: number) =>
    safely("emergencyDetails", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      const who = [job.request.contactName, job.request.phone].filter(Boolean).join(", ");
      if (!who) return;
      await tell([job.technician], {
        subject: both(`Emergency job #${d.id}: customer's contact`, `مهمة طارئة #${d.id}: بيانات العميل`),
        title: both("The customer's contact", "بيانات التواصل مع العميل"),
        lines: [both(`Emergency job #${d.id} (${d.category.en}): ${who}.`, `المهمة الطارئة #${d.id} (${d.category.ar}): ${who}.`)],
        path: "/tech",
        button: both("Open my jobs", "فتح مهامي"),
      }, { path: `/tech?job=${d.id}`, urgent: true });
    }),

  /** A customer sent an emergency (priority dispatch) and is calling the emergency line. */
  emergencyReported: (id: number) =>
    safely("emergencyReported", async () => {
      const sent = await getDb().query.emergencyRequests.findFirst({ where: eq(emergencyRequests.id, id) });
      if (!sent) return;
      const problem = local(EMERGENCY_PROBLEM_MAP[sent.problem]?.label, sent.problem);
      const map = directionsLinks(sent.lat, sent.lng).google;
      await tell(await staffFor(EMERGENCY_PROBLEM_MAP[sent.problem]?.category ?? null), {
        subject: both(`Emergency: ${problem.en}`, `طوارئ: ${problem.ar}`),
        title: both("An emergency is coming in", "حالة طوارئ واردة"),
        lines: [
          both(
            `${problem.en}. The customer is calling the emergency line now.`,
            `${problem.ar}. يتصل العميل بخط الطوارئ الآن.`,
          ),
          ...(sent.phone ? [both(`Phone: ${sent.phone}.`, `الهاتف: ${sent.phone}.`)] : []),
          ...(sent.address ? [both(`Address: ${sent.address}.`, `العنوان: ${sent.address}.`)] : []),
          // What the customer answered; the urgent answers first, marked.
          ...answerLines(sent.problem, sent.answers)
            .sort((a, b) => Number(b.alert) - Number(a.alert))
            .map((a) =>
              both(
                `${a.alert ? "(!) " : ""}${a.question.en} ${a.answer.en}.`,
                `${a.alert ? "(!) " : ""}${a.question.ar} ${a.answer.ar}.`,
              ),
            ),
          both(`Map: ${map}`, `الخريطة: ${map}`),
        ],
        path: "/dashboard?tab=emergencies",
        button: both("Open emergencies", "فتح حالات الطوارئ"),
      }, { path: "/dashboard?tab=emergencies", urgent: true });
    }),

  /** A specialist sent a technician to an emergency: they go now; a signed-in customer is told. */
  emergencyDispatched: (id: number) =>
    safely("emergencyDispatched", async () => {
      const job = await loadJob(id);
      const d = describe(job);
      const contact = job.request.contactName;
      await tell([job.technician], {
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
      }, { path: `/tech?job=${d.id}`, urgent: true });
      const techName = job.technician?.name;
      await tell([job.customer], {
        subject: both(`${cap(d.worker.en.a)} is on the way`, `${d.worker.ar.one} في الطريق إليك`),
        title: both("Help is on the way", "المساعدة في الطريق"),
        lines: [
          both(`${d.category.en}: we're sending ${d.worker.en.a} now.`, `${d.category.ar}: يتوجّه إليك ${d.worker.ar.one} الآن.`),
          ...(techName ? [both(`Your ${d.worker.en.word}: ${techName}.`, `${d.worker.ar.the} المكلّف: ${techName}.`)] : []),
          both(
            "When they're on the way, you can follow them on the map in your requests.",
            "عندما يكون في الطريق، يمكنك متابعته على الخريطة في صفحة طلباتك.",
          ),
        ],
        path: "/requests",
        button: both("See my request", "عرض طلبي"),
      }, { path: `/requests/${d.id}`, urgent: true });
    }),
};
