import { useState } from "react";
import { BadgeCheck, ChevronDown, FileText, Loader2, Mail, MessageCircle, Phone, PhoneCall, UserCheck, X } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/router";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import { useConfirm } from "@/hooks/useConfirm";
import { trpc } from "@/providers/trpc";
import { telLink, whatsappLink } from "@/lib/contact";
import { CATEGORY_MAP } from "@contracts/services";
import {
  APPLICATION_DOCUMENTS,
  AVAILABILITY_LABELS,
  EXPERIENCE_LABELS,
  TRANSPORT_LABELS,
  WORK_MODE_STAFF_LABELS,
  type Availability,
  type ExperienceLevel,
} from "@contracts/applications";
import { REJECTED_APPLICATION_RETENTION_DAYS } from "@contracts/legal";

type Application = inferRouterOutputs<AppRouter>["join"]["list"][number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BTN = "inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold disabled:opacity-50";
const OUTLINE = `${BTN} border border-navy/15 text-navy hover:bg-navy/5`;

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

/**
 * One application. The admin calls the applicant to set up a meeting in person, then accepts
 * them (their technician account is created) or rejects the application.
 */
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
  const [confirm, confirmDialog] = useConfirm();
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const utils = trpc.useUtils();
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
  const rejected = app.status === "rejected";
  const hireEmail = app.email ?? email.trim();
  const canHire = !hired && EMAIL_PATTERN.test(hireEmail);
  // Short-lived links, fetched only when the card is open.
  const docs = trpc.join.documents.useQuery({ id: app.id }, { enabled: open, staleTime: 60_000 });
  const papers = APPLICATION_DOCUMENTS.filter((kind) => kind !== "photo" && docs.data?.[kind] !== undefined);
  const photo = docs.data?.photo;
  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString(lang === "ar" ? "ar" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  // The short form asks for transport only; older applications also have these answers.
  const details: [string, string | null][] = [
    [p(t.join.email), app.email],
    [p(t.dash3.transport), app.transport ? p(TRANSPORT_LABELS[app.transport]) : null],
    [p(t.join.area), app.area],
    [p(t.join.experience), app.experience ? p(EXPERIENCE_LABELS[app.experience as ExperienceLevel]) : null],
    [p(t.join.availability), app.availability ? p(AVAILABILITY_LABELS[app.availability as Availability]) : null],
    [p(t.dash3.tools), app.hasTools === null ? null : p(app.hasTools ? t.join.yes : t.join.no)],
    [
      p(t.dash3.workMode),
      app.workMode ? (app.workMode === "company" && app.companyName ? app.companyName : p(WORK_MODE_STAFF_LABELS[app.workMode])) : null,
    ],
  ];

  async function onHire() {
    // If the email already has an account, say whose: that account becomes the technician.
    const { existing } = await utils.join.hireCheck.fetch({ email: hireEmail });
    const question = existing
      ? p(t.dash3.hireConfirmExisting)
          .replace("{email}", hireEmail)
          .replace("{name}", existing.name ?? hireEmail)
          .replace("{applicant}", app.name)
      : p(t.dash3.hireConfirm).replace("{email}", hireEmail);
    if (await confirm({ title: question, confirmLabel: p(t.dash3.accept) })) {
      hire.mutate({ id: app.id, email: app.email ? undefined : hireEmail });
    }
  }

  async function onReject() {
    const ok = await confirm({
      title: p(t.dash3.rejectAsk).replace("{name}", app.name),
      message: p(t.dash3.rejectNote),
      confirmLabel: p(t.dash3.reject),
      tone: "danger",
    });
    if (ok) setStatus.mutate({ id: app.id, status: "rejected" });
  }

  return (
    <div className="card-br overflow-hidden">
      {confirmDialog}
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-4 p-4 text-start">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bird/10 text-bird">
          <ServiceIcon id={app.trade} className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-sm font-extrabold text-navy">
            {app.name} <span className="font-normal text-navy/70">· {trade ? p(trade.name) : app.trade}</span>
          </span>
          <span className="block truncate text-xs text-navy/70">
            <span dir="ltr">{app.phone}</span> · {p(t.dash3.applied)} {new Date(app.createdAt).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold ${
            hired
              ? "bg-green-700/10 text-green-800"
              : rejected
                ? "bg-red-700/10 text-red-700"
                : app.status === "new"
                  ? "bg-flame/10 text-flame-ink"
                  : "bg-navy/[0.06] text-navy/70"
          }`}
        >
          {p(t.dash3[app.status])}
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-navy/60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-navy/10 p-4 sm:p-5">
          <div className="grid gap-5 sm:grid-cols-[7rem_minmax(0,1fr)]">
            {/* the profile photo customers will see */}
            <div>
              <p className="text-xs font-medium text-navy/65">{p(t.dash3.photo)}</p>
              <div className="mt-1.5 flex aspect-square w-28 items-center justify-center overflow-hidden rounded-xl border border-navy/12 bg-paper">
                {docs.isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-navy" />
                ) : photo ? (
                  <a href={photo.url} target="_blank" rel="noreferrer" className="block h-full w-full">
                    <img src={photo.url} alt={app.name} className="h-full w-full object-cover" />
                  </a>
                ) : (
                  <span className="text-xs font-semibold text-navy/50">{p(t.docs.missing)}</span>
                )}
              </div>
            </div>

            <div className="min-w-0">
              {/* one-tap contact */}
              <div className="flex flex-wrap gap-2">
                <a href={telLink(app.phone)} className={`${BTN} bg-navy text-white hover:bg-navy/90`}>
                  <Phone className="h-4 w-4" /> {p(t.dash3.call)} <span dir="ltr">{app.phone}</span>
                </a>
                <a href={whatsappLink(app.phone)} target="_blank" rel="noreferrer" className={OUTLINE}>
                  <MessageCircle className="h-4 w-4" /> {p(t.dash3.whatsapp)}
                </a>
                {app.email && (
                  <a href={`mailto:${app.email}`} className={OUTLINE}>
                    <Mail className="h-4 w-4" /> {p(t.dash3.emailAction)}
                  </a>
                )}
              </div>

              <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {details
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-xs font-medium text-navy/65">{label}</dt>
                      <dd className="truncate font-semibold text-navy">{value}</dd>
                    </div>
                  ))}
              </dl>
              {app.notes && <p className="mt-3 rounded-lg bg-navy/[0.04] p-3 text-sm text-navy/80">{app.notes}</p>}

              {/* papers sent with older applications (the short form only asks for the photo) */}
              {papers.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-navy/65">{p(t.dash3.olderPapers)}</p>
                  <ul className="mt-1.5 flex flex-wrap gap-2">
                    {papers.map((kind) => {
                      const doc = docs.data?.[kind];
                      return (
                        <li key={kind}>
                          {doc ? (
                            <a href={doc.url} target="_blank" rel="noreferrer" className={OUTLINE}>
                              <FileText className="h-4 w-4" /> {p(t.docs[kind])}
                            </a>
                          ) : (
                            <span className="text-xs font-semibold text-navy/50">
                              {p(t.docs[kind])}: {p(t.docs.missing)}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {app.documentsDeletedAt ? (
                    <p className="mt-2 text-xs text-navy/60">{p(t.docs.deletedOn).replace("{date}", formatDate(app.documentsDeletedAt))}</p>
                  ) : (
                    rejected && (
                      <p className="mt-2 text-xs text-navy/60">
                        {p(t.docs.deleteOn).replace(
                          "{date}",
                          formatDate(new Date(new Date(app.rejectedAt ?? app.createdAt).getTime() + REJECTED_APPLICATION_RETENTION_DAYS * 86_400_000)),
                        )}
                      </p>
                    )
                  )}
                </div>
              )}
            </div>
          </div>

          {/* the decision */}
          <div className="mt-5 border-t border-navy/10 pt-4">
            {hired ? (
              <p className="inline-flex items-center gap-2 text-sm font-bold text-navy">
                <UserCheck className="h-5 w-5 text-green-700" /> {p(t.dash3.technicianAccount)}
              </p>
            ) : rejected ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-red-700">{p(t.dash3.rejectedNote)}</p>
                <button
                  type="button"
                  onClick={() => setStatus.mutate({ id: app.id, status: "new" })}
                  disabled={setStatus.isPending}
                  className={OUTLINE}
                >
                  {p(t.dash3.reopen)}
                </button>
              </div>
            ) : (
              <>
                <p className="font-display text-sm font-extrabold text-navy">{p(t.dash3.nextTitle)}</p>
                <p className="mt-0.5 text-xs text-navy/65">{p(t.dash3.nextHint)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {app.status === "contacted" ? (
                    <span className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy/[0.05] px-3 text-sm font-semibold text-navy">
                      <PhoneCall className="h-4 w-4 text-green-700" /> {p(t.dash3.called)}
                      <button
                        type="button"
                        onClick={() => setStatus.mutate({ id: app.id, status: "new" })}
                        disabled={setStatus.isPending}
                        className="text-xs font-semibold text-navy/60 underline underline-offset-2 hover:text-navy"
                      >
                        {p(t.dash3.undo)}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStatus.mutate({ id: app.id, status: "contacted" })}
                      disabled={setStatus.isPending}
                      className={OUTLINE}
                    >
                      <PhoneCall className="h-4 w-4" /> {p(t.dash3.markCalled)}
                    </button>
                  )}
                </div>
                {!app.email && (
                  <label className="mt-3 flex max-w-sm flex-col text-xs font-medium text-navy/65">
                    {p(t.dash3.hireEmail)}
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      dir="ltr"
                      className="mt-1 h-10 rounded-lg border border-navy/20 bg-white px-3 text-sm font-semibold text-navy focus:border-navy focus:outline-none"
                    />
                  </label>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onHire}
                    disabled={!canHire || hire.isPending}
                    className={`${BTN} bg-green-700 text-white hover:bg-green-800`}
                  >
                    {hire.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                    {p(t.dash3.accept)}
                  </button>
                  <button
                    type="button"
                    onClick={onReject}
                    disabled={setStatus.isPending}
                    className={`${BTN} border border-red-700/40 text-red-700 hover:bg-red-700/5`}
                  >
                    <X className="h-4 w-4" /> {p(t.dash3.reject)}
                  </button>
                </div>
              </>
            )}
          </div>

          {(result || hire.error || setStatus.error) && (
            <p role={result ? "status" : "alert"} className={`mt-3 text-sm font-semibold ${result ? "text-navy" : "text-destructive"}`}>
              {result ?? hire.error?.message ?? setStatus.error?.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
