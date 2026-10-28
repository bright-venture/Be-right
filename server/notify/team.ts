// Notifications for the team.

import { eq } from "drizzle-orm";
import { technicianApplications, users } from "@db/schema";
import { CATEGORY_MAP } from "@contracts/services";
import { DISTRICT_INFO } from "@contracts/districts";
import { getDb } from "../queries/connection";
import { env } from "../lib/env";
import { emailsOf, safely } from "./people";
import { requestId } from "../lib/log";
import { both, local, send } from "./email";

/** The team: applications, a new professional, and server errors for the admins. */
export const teamNotifications = {
  /**
   * Server errors happened: tell the admins (at most hourly, see lib/alerts.ts). Sent to the
   * ADMIN_EMAILS setting too, in case the database itself is what's failing.
   */
  serverError: (path: string) =>
    safely("serverError", async () => {
      const ref = requestId();
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
          ...(ref
            ? [both(`Search the log for [${ref}]: every line of that request starts with it.`, `ابحث في السجل عن [${ref}]: كل سطر من ذلك الطلب يبدأ به.`)]
            : []),
        ],
        path: "/admin",
        button: both("Open the admin area", "فتح الإدارة"),
      });
    }),

  /** Someone applied to work as a technician: an admin calls them to set up a meeting. */
  applicationSubmitted: (applicationId: number) =>
    safely("applicationSubmitted", async () => {
      const app = await getDb().query.technicianApplications.findFirst({
        where: eq(technicianApplications.id, applicationId),
      });
      if (!app) return;
      const trade = local(CATEGORY_MAP[app.trade]?.name, app.trade);
      // Newer applications name districts; older ones wrote an area.
      const where = app.districts?.length
        ? { en: app.districts.map((d) => DISTRICT_INFO[d].name.en).join(", "), ar: app.districts.map((d) => DISTRICT_INFO[d].name.ar).join("، ") }
        : app.area
          ? { en: app.area, ar: app.area }
          : null;
      await send(await emailsOf("admin"), {
        subject: both(`New professional application: ${app.name}`, `طلب توظيف مهني جديد: ${app.name}`),
        title: both("Someone applied to work with us", "تقدّم شخص للعمل معنا"),
        lines: [
          both(
            `${app.name}: ${trade.en}${where ? `, ${where.en}` : ""}. Phone: ${app.phone}.`,
            `${app.name}: ${trade.ar}${where ? `، ${where.ar}` : ""}. الهاتف: ${app.phone}.`,
          ),
          both(
            "Call them to set up a meeting in person, then accept or reject the application.",
            "اتصل به لتحديد مقابلة شخصية، ثم اقبل الطلب أو ارفضه.",
          ),
        ],
        path: "/admin?tab=applications",
        button: both("Review the application", "راجع الطلب"),
      });
    }),

  /** An admin accepted an applicant: the specialists have a new technician to assign jobs to. */
  technicianJoined: (applicationId: number) =>
    safely("technicianJoined", async () => {
      const app = await getDb().query.technicianApplications.findFirst({
        where: eq(technicianApplications.id, applicationId),
      });
      if (!app) return;
      const trade = local(CATEGORY_MAP[app.trade]?.name, app.trade);
      await send(await emailsOf("specialist"), {
        subject: both(`New professional on the team: ${app.name}`, `مهني جديد في الفريق: ${app.name}`),
        title: both("A new professional joined", "انضمّ مهني جديد"),
        lines: [
          both(`${app.name}: ${trade.en}.`, `${app.name}: ${trade.ar}.`),
          both("An admin met them and accepted them. You can now assign them jobs.", "قابلته الإدارة وقبلته. يمكنك الآن إسناد المهام إليه."),
        ],
        path: "/dashboard?tab=technicians",
        button: both("See the professionals", "عرض المهنيين"),
      });
    }),
};
