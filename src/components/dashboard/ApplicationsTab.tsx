import { useState } from "react";
import { BadgeCheck, ChevronDown, FileText, Loader2, Lock, Mail, MessageCircle, Phone, UserCheck } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/router";
import { useAuth } from "@/hooks/useAuth";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { telLink, whatsappLink } from "@/lib/contact";
import { CATEGORY_MAP } from "@contracts/services";
import {
  AVAILABILITY_LABELS,
  EXPERIENCE_LABELS,
  MANUAL_APPLICATION_STATUSES,
  TRANSPORT_LABELS,
  requiredDocuments,
  type Availability,
  type ExperienceLevel,
} from "@contracts/applications";
import { REJECTED_APPLICATION_RETENTION_DAYS } from "@contracts/legal";

type Application = inferRouterOutputs<AppRouter>["join"]["list"][number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ApplicationsTab() {
  const { t, p } = useI18n();
  const utils = trpc.useUtils();
  const applications = trpc.join.list.useQuery();
  const [openId, setOpenId] = useState<number | null>(null);
  const rows = applications.data ?? [];

  if (!applications.isLoading && rows.length === 0) {
    return (
      <div className="card-br mt-8 p-10 text-center font-semibold text-navy/70">
        {p(t.dash3.noApplications)}
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-3">
      {rows.map((a) => (
        <ApplicationCard
          key={a.id}
          app={a}
          open={openId === a.id}
          onToggle={() => setOpenId(openId === a.id ? null : a.id)}
          onChanged={() => {
            void utils.join.list.invalidate();
            void utils.tech.list.invalidate();
          }}
        />
      ))}
      {applications.isLoading && <Loader2 className="mx-auto h-6 w-6 animate-spin text-navy" />}
    </div>
  );
}

function ApplicationCard({
  app,
  open,
  onToggle,
  onChanged,
}: {
  app: Application;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const { t, p, lang } = useI18n();
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const utils = trpc.useUtils();
  // Two-step review: admins approve (and see the papers); specialists then hire or reject.
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const approve = trpc.join.approve.useMutation({ onSuccess: onChanged });
  const setStatus = trpc.join.setStatus.useMutation({ onSuccess: onChanged });
  const hire = trpc.join.hire.useMutation({
    onSuccess: (res) => {
      setResult(p(res.invited ? t.dash3.hiredInvited : t.dash3.hiredExisting).replace("{email}", res.email));
      onChanged();
    },
  });

  const trade = CATEGORY_MAP[app.trade];
  // Only a linked account counts as hired: older applications could be labelled
  // "hired" by hand without an account ever being created.
  const hired = app.status === "hired" && app.hiredUserId != null;
  const hireEmail = app.email ?? email.trim();
  // Specialists only get the photo: the papers are for admins.
  const needed = requiredDocuments(app.transport).filter((kind) => isAdmin || kind === "photo");
  const hasDocuments = app.documentsOnFile;
  const approved = !!app.approvedAt;
  const stillOpen = app.status !== "hired" && app.status !== "rejected";
  const canHire = !hired && approved && hasDocuments && EMAIL_PATTERN.test(hireEmail);
  // Short-lived links, fetched only when the card is open.
  const docs = trpc.join.documents.useQuery({ id: app.id }, { enabled: open, staleTime: 60_000 });
  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString(lang === "ar" ? "ar-LB" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const yesNo = (v: boolean | null) => (v === null ? p(t.dash3.notProvided) : v ? p(t.join.yes) : p(t.join.no));
  const detail = (label: string, value: string) => (
    <div className="flex justify-between gap-4">
      <dt className="text-navy/70">{label}</dt>
      <dd className="text-end font-semibold text-navy">{value}</dd>
    </div>
  );

  async function onHire() {
    // If the email already has an account, say whose: that account becomes the technician.
    const { existing } = await utils.join.hireCheck.fetch({ email: hireEmail });
    const question = existing
      ? p(t.dash3.hireConfirmExisting)
          .replace("{email}", hireEmail)
          .replace("{name}", existing.name ?? hireEmail)
          .replace("{applicant}", app.name)
      : p(t.dash3.hireConfirm).replace("{email}", hireEmail);
    if (window.confirm(question)) {
      hire.mutate({ id: app.id, email: app.email ? undefined : hireEmail });
    }
  }

  return (
    <div className="card-br overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 p-4 text-start"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-navy/15 bg-paper text-bird">
          <ServiceIcon id={app.trade} className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-sm font-extrabold text-navy">
            {app.name} <span className="font-normal text-navy/70">· {trade ? p(trade.name) : app.trade}</span>
          </span>
          <span className="block truncate text-xs text-navy/70">
            {app.area} · {p(t.dash3.applied)} {new Date(app.createdAt).toLocaleDateString(lang === "ar" ? "ar-LB" : "en-GB")}
          </span>
        </span>
        {isAdmin && stillOpen && (
          <span
            className={`hidden shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold sm:inline-flex ${
              approved ? "bg-bird/10 text-bird" : "bg-flame/10 text-flame-ink"
            }`}
          >
            {approved && <BadgeCheck className="h-3.5 w-3.5" />}
            {p(approved ? t.dash3.approvedBadge : t.dash3.awaitingApproval)}
          </span>
        )}
        <span
          className={`shrink-0 rounded-full border-2 px-2.5 py-0.5 text-[11px] font-bold ${
            hired ? "border-navy bg-navy text-paper" : "border-navy/25 text-navy"
          }`}
        >
          {p(t.dash3[app.status])}
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-navy transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t-2 border-navy/10 p-4 sm:p-5">
          {/* one-tap contact */}
          <div className="flex flex-wrap gap-2">
            <a href={telLink(app.phone)} className="btn-pill-outline !min-h-10 !px-4 !py-1.5 text-xs">
              <Phone className="h-4 w-4" /> {p(t.dash3.call)} <span dir="ltr">{app.phone}</span>
            </a>
            <a href={whatsappLink(app.phone)} target="_blank" rel="noreferrer" className="btn-pill-outline !min-h-10 !px-4 !py-1.5 text-xs">
              <MessageCircle className="h-4 w-4" /> {p(t.dash3.whatsapp)}
            </a>
            {app.email && (
              <a href={`mailto:${app.email}`} className="btn-pill-outline !min-h-10 !px-4 !py-1.5 text-xs">
                <Mail className="h-4 w-4" /> {p(t.dash3.emailAction)}
              </a>
            )}
          </div>

          <dl className="mt-4 flex flex-col gap-1.5 text-sm">
            {detail(p(t.join.email), app.email ?? p(t.dash3.notProvided))}
            {detail(p(t.join.area), app.area)}
            {detail(
              p(t.join.experience),
              app.experience ? p(EXPERIENCE_LABELS[app.experience as ExperienceLevel]) : p(t.dash3.notProvided),
            )}
            {detail(
              p(t.join.availability),
              app.availability ? p(AVAILABILITY_LABELS[app.availability as Availability]) : p(t.dash3.notProvided),
            )}
            {detail(p(t.dash3.tools), yesNo(app.hasTools))}
            {detail(
              p(t.dash3.transport),
              app.transport ? p(TRANSPORT_LABELS[app.transport]) : yesNo(app.hasTransport),
            )}
          </dl>
          {app.notes && <p className="mt-3 rounded-xl bg-navy/5 p-3 text-sm text-navy/80">{app.notes}</p>}

          {/* identity documents (private, specialists only) */}
          <div className="mt-4">
            <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/70">{p(t.docs.title)}</p>
            {/* photo first, then the papers; an odd last one fills its row on phones */}
            <div
              className={`mt-2 grid gap-2 ${
                needed.length === 1
                  ? "w-32 grid-cols-1"
                  : `grid-cols-2 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 ${needed.length === 5 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`
              }`}
            >
              {needed.map((kind) => {
                const doc = docs.data?.[kind];
                return (
                  <div key={kind} className="rounded-xl border-2 border-navy/15 bg-paper p-2 text-center">
                    <p className="truncate text-[11px] font-bold text-navy">{p(t.docs[kind])}</p>
                    {docs.isLoading ? (
                      <Loader2 className="mx-auto mt-3 h-5 w-5 animate-spin text-navy" />
                    ) : !doc ? (
                      <p className="mt-3 text-xs font-bold text-destructive">{p(t.docs.missing)}</p>
                    ) : doc.isPdf ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-navy underline underline-offset-4"
                      >
                        <FileText className="h-4 w-4" /> PDF · {p(t.docs.open)}
                      </a>
                    ) : (
                      <a href={doc.url} target="_blank" rel="noreferrer" className="mt-1 block">
                        <img
                          src={doc.url}
                          alt={p(t.docs[kind])}
                          className={`mx-auto aspect-square w-full rounded-lg object-cover ${kind === "photo" ? "" : "object-top"}`}
                        />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            {app.documentsDeletedAt ? (
              <p className="mt-2 text-xs font-semibold text-navy/70">
                {p(t.docs.deletedOn).replace("{date}", formatDate(app.documentsDeletedAt))}
              </p>
            ) : app.status === "rejected" && hasDocuments ? (
              <p className="mt-2 text-xs text-navy/70">
                {p(t.docs.deleteOn).replace(
                  "{date}",
                  formatDate(
                    new Date(
                      new Date(app.rejectedAt ?? app.createdAt).getTime() + REJECTED_APPLICATION_RETENTION_DAYS * 86_400_000,
                    ),
                  ),
                )}
              </p>
            ) : (
              !hasDocuments &&
              !hired && <p className="mt-2 text-xs font-semibold text-destructive">{p(t.docs.missingAll)}</p>
            )}
            {!isAdmin && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-navy/70">
                <Lock className="mt-px h-3.5 w-3.5 shrink-0" /> {p(t.dash3.privateDocs)}
              </p>
            )}
          </div>

          {/* step 1 of 2: the admin approves for the specialists */}
          {isAdmin && stillOpen && (
            <div className="mt-5 rounded-2xl border-2 border-navy/10 bg-paper p-4">
              {approved ? (
                <p className="flex items-center gap-2 text-sm font-bold text-navy">
                  <BadgeCheck className="h-5 w-5 text-bird" />
                  {p(t.dash3.approvedOn).replace("{date}", formatDate(app.approvedAt!))}
                </p>
              ) : (
                <>
                  <p className="text-sm text-navy/80">{p(t.dash3.approveHint)}</p>
                  <button
                    type="button"
                    onClick={() => approve.mutate({ id: app.id })}
                    disabled={approve.isPending || !hasDocuments}
                    className="btn-pill-primary mt-3 !min-h-11 !py-2 disabled:opacity-40"
                  >
                    {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                    {p(t.dash3.approve)}
                  </button>
                </>
              )}
            </div>
          )}

          {/* status + hire */}
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t-2 border-navy/10 pt-4">
            {hired ? (
              <span className="inline-flex items-center gap-2 text-sm font-bold text-navy">
                <UserCheck className="h-5 w-5 text-bird" /> {p(t.dash3.technicianAccount)}
              </span>
            ) : (
              <>
                {MANUAL_APPLICATION_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus.mutate({ id: app.id, status: s })}
                    disabled={setStatus.isPending || app.status === s}
                    className={`min-h-9 rounded-full border-2 px-3 text-[11px] font-bold transition-colors ${
                      app.status === s
                        ? "border-navy bg-navy text-paper"
                        : "border-navy/25 text-navy/70 hover:border-navy hover:text-navy"
                    }`}
                  >
                    {p(t.dash3[s])}
                  </button>
                ))}
              </>
            )}
          </div>

          {!hired && approved && (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              {!app.email && (
                <label className="flex min-w-60 flex-1 flex-col text-xs font-bold text-navy">
                  {p(t.dash3.hireEmail)}
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    dir="ltr"
                    className="mt-1 min-h-11 rounded-2xl border-2 border-navy/30 bg-white px-4 text-sm font-semibold text-navy focus:border-flame focus:outline-none"
                  />
                </label>
              )}
              <button
                onClick={onHire}
                disabled={!canHire || hire.isPending}
                className="btn-pill-primary !min-h-11 !py-2 disabled:opacity-40"
              >
                {hire.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                {p(t.dash3.hire)}
              </button>
            </div>
          )}

          {(result || hire.error || setStatus.error || approve.error) && (
            <p
              role={result ? "status" : "alert"}
              className={`mt-3 text-sm font-semibold ${result ? "text-navy" : "text-destructive"}`}
            >
              {result ?? hire.error?.message ?? setStatus.error?.message ?? approve.error?.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
