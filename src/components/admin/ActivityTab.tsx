// Admin → Activity: what happened on requests, and what staff did (the audit trail).

import { useState } from "react";
import {
  BadgeCheck,
  CalendarClock,
  ClipboardCheck,
  FileText,
  KeyRound,
  Car,
  MapPin,
  Tag,
  UserCheck,
  UserCog,
  UserMinus,
  UserX,
  UserPlus,
  ShieldAlert,
  type LucideIcon,
  Layers,
} from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { formatMoment, meetingDate } from "@/lib/time";
import { CATEGORY_MAP, forWorker } from "@contracts/services";
import type { AuditAction } from "@contracts/audit";
import { arabicDigits } from "@contracts/legal";
import { LoadMore, Pending } from "./adminParts";

/** What happened, newest first, and who did it: on requests, or staff actions (the audit trail). */
export function ActivityTab() {
  const { t, p } = useI18n();
  const [view, setView] = useState<"requests" | "staff">("requests");
  return (
    <div className="mt-8">
      <div role="tablist" className="grid w-full max-w-sm grid-cols-2 gap-1 rounded-full border border-navy/15 bg-white p-1">
        {(["requests", "staff"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={view === k}
            onClick={() => setView(k)}
            className={`min-h-10 rounded-full px-4 text-sm font-bold transition-colors ${
              view === k ? "bg-navy text-paper" : "text-navy/70 hover:text-navy"
            }`}
          >
            {p(k === "requests" ? t.admin.activityRequests : t.admin.activityStaff)}
          </button>
        ))}
      </div>
      {view === "requests" ? <RequestActivity /> : <StaffActivity />}
    </div>
  );
}

const AUDIT_ICON: Record<AuditAction, LucideIcon> = {
  staff_added: UserPlus,
  staff_role_changed: UserCog,
  two_step_reset: KeyRound,
  documents_viewed: FileText,
  application_approved: BadgeCheck,
  meeting_booked: CalendarClock,
  application_status: ClipboardCheck,
  technician_hired: UserCheck,
  technician_removed: UserMinus,
  staff_account_deleted: UserX,
  prices_changed: Tag,
  technician_base_set: MapPin,
  technician_transport_set: Car,
  technician_districts_set: MapPin,
  service_specialist_set: Layers,
  staff_access_refused: ShieldAlert,
};

/** Staff actions and document views, newest first. */
function StaffActivity() {
  const { t, p, lang } = useI18n();
  const list = trpc.admin.auditLog.useInfiniteQuery({}, { getNextPageParam: (last) => last.nextCursor, refetchInterval: 60_000 });
  if (!list.data) return <Pending error={list.error} retry={() => void list.refetch()} />;
  const data = list.data.pages.flatMap((page) => page.items);
  if (data.length === 0) return <p className="mt-6 text-sm text-navy/60">{p(t.admin.noStaffActivity)}</p>;

  const roles: Record<string, { en: string; ar: string }> = {
    customer: t.app.roleCustomer,
    technician: t.app.roleTechnician,
    specialist: t.admin.roleSpecialist,
    admin: t.admin.roleAdmin,
  };
  const statuses: Record<string, { en: string; ar: string }> = {
    new: t.dash3.new,
    contacted: t.dash3.contacted,
    rejected: t.dash3.rejected,
    hired: t.dash3.hired,
  };
  const word = (labels: Record<string, { en: string; ar: string }>, value: unknown) =>
    typeof value === "string" ? (labels[value] ? p(labels[value]) : value) : "";

  return (
    <ol className="mt-6 flex flex-col gap-2">
      {data.map((e) => {
        const d = e.details ?? {};
        const target = e.targetName || e.targetEmail || (typeof d.email === "string" ? d.email : p(t.admin.audit.someone));
        const applicant = e.applicantName || p(t.admin.audit.someone);
        const text =
          e.action === "staff_added"
            ? d.invited
              ? t.admin.audit.staff_invited
              : t.admin.audit.staff_added
            : e.action === "staff_role_changed" && d.to === "customer"
              ? t.admin.audit.staff_removed
              : e.action === "staff_access_refused"
                ? d.reason === "role"
                  ? t.admin.audit.refused_role
                  : t.admin.audit.refused_password
                : e.action === "meeting_booked"
                  ? d.rescheduled
                    ? t.admin.audit.meeting_moved
                    : t.admin.audit.meeting_booked
                  : e.action === "technician_hired"
                    ? t.admin.audit.technician_approved
                    : e.action === "service_specialist_set" && d.on === false
                      ? t.admin.audit.service_specialist_removed
                      : e.action === "service_specialist_set" && !e.targetName && !e.targetEmail
                        ? t.admin.audit.service_specialist_admins
                        : t.admin.audit[e.action];
        const sentence = p(text)
          .replace("{target}", target)
          .replace("{applicant}", applicant)
          .replace("{date}", typeof d.at === "string" ? meetingDate(d.at, lang) : "")
          .replace("{role}", word(roles, d.role))
          .replace("{service}", typeof d.service === "string" && CATEGORY_MAP[d.service] ? p(CATEGORY_MAP[d.service].name) : "")
          .replace("{from}", word(e.action === "application_status" ? statuses : roles, d.from))
          .replace("{to}", word(e.action === "application_status" ? statuses : roles, d.to));
        const Icon = AUDIT_ICON[e.action] ?? FileText;
        return (
          <li key={e.id} className="grid grid-cols-[auto_1fr] gap-x-3 rounded-2xl border border-navy/10 bg-white p-4">
            <span
              className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl ${
                e.action === "staff_access_refused" ? "bg-destructive/10 text-destructive" : "bg-navy/5 text-bird"
              }`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-navy">{sentence}</p>
              {typeof d.unassigned === "number" && d.unassigned > 0 && (
                <p className="mt-0.5 text-sm text-navy/80">{p(t.admin.audit.unassigned).replace("{n}", lang === "ar" ? arabicDigits(d.unassigned) : String(d.unassigned))}</p>
              )}
              <p className="mt-1 text-xs text-navy/50">
                {formatMoment(e.createdAt, lang)} ·{" "}
                {p(t.admin.by).replace("{name}", e.actorName || e.actorEmail || p(t.admin.audit.someone))}
                {e.actorRole && roles[e.actorRole] ? ` (${p(roles[e.actorRole])})` : ""}
              </p>
            </div>
          </li>
        );
      })}
      <li className="flex justify-center">
        <LoadMore list={list} />
      </li>
    </ol>
  );
}

/** What happened on requests, newest first, and who did it. */
function RequestActivity() {
  const { t, p, lang } = useI18n();
  const list = trpc.admin.activity.useInfiniteQuery({}, { getNextPageParam: (last) => last.nextCursor, refetchInterval: 60_000 });
  if (!list.data) return <Pending error={list.error} retry={() => void list.refetch()} />;
  const data = list.data.pages.flatMap((page) => page.items);
  if (data.length === 0) return <p className="mt-6 text-sm text-navy/60">{p(t.admin.noActivity)}</p>;

  const labels = { ...t.status, ...t.events } as Record<string, { en: string; ar: string }>;
  const roles = { customer: t.app.roleCustomer, technician: t.app.roleTechnician, specialist: t.app.roleSpecialist, admin: t.app.roleAdmin };

  return (
    <ol className="mt-6 flex flex-col gap-2">
      {data.map((e) => (
        <li key={e.id} className="grid grid-cols-[auto_1fr] gap-x-3 rounded-2xl border border-navy/10 bg-white p-4">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-navy/5 text-bird">
            <ServiceIcon id={e.category ?? ""} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-bold text-navy">{labels[e.status] ? p(forWorker(labels[e.status], e.category)) : e.status}</span>
              <span className="text-navy/60">
                {p(t.admin.request).replace("{id}", String(e.requestId))}
                {e.category && CATEGORY_MAP[e.category] ? ` · ${p(CATEGORY_MAP[e.category].name)}` : ""}
              </span>
            </p>
            {e.note && <p className="mt-0.5 text-sm text-navy/80">{e.note}</p>}
            <p className="mt-1 text-xs text-navy/50">
              {formatMoment(e.createdAt, lang)} ·{" "}
              {e.actorName || e.actorEmail
                ? `${p(t.admin.by).replace("{name}", e.actorName || e.actorEmail || "")}${
                    e.actorRole ? ` (${p(roles[e.actorRole as keyof typeof roles])})` : ""
                  }`
                : p(t.admin.automatic)}
            </p>
          </div>
        </li>
      ))}
      <li className="flex justify-center">
        <LoadMore list={list} />
      </li>
    </ol>
  );
}
