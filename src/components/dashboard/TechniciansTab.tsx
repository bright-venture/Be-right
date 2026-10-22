import { Fragment, useState } from "react";
import { Car, FileText, Loader2, Mail, Map, MessageCircle, Phone, Search, Star, UserMinus } from "lucide-react";
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
  EXPERIENCE_LABELS,
  TRANSPORT_LABELS,
  WORK_MODE_STAFF_LABELS,
  type ExperienceLevel,
} from "@contracts/applications";
import { TransportEditor } from "./TransportEditor";
import { DistrictsEditor } from "./DistrictsEditor";
import { DISTRICT_INFO } from "@contracts/districts";
import { Avatar } from "./RequestDetail";
import { useAuth } from "@/hooks/useAuth";

type Technician = inferRouterOutputs<AppRouter>["tech"]["list"][number];

/** The table's columns on a computer: technician, area, experience, works, transport, 3 figures,
 * and the buttons (fixed: room for all seven, so the headings line up with every row). */
const COLUMNS =
  "lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_4.5rem_5.5rem_4.5rem_18rem]";
const ICON_BTN =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-navy/15 text-navy transition-colors hover:bg-navy/5 disabled:opacity-40";
const HEAD = "text-[11px] font-semibold uppercase tracking-wide text-navy/50";

/**
 * Every technician as one row of a table (on phones, one block each). Specialists only look
 * and contact; admins also open the hiring documents and remove a technician.
 * `onGoToApplications`: only in the admin area (specialists don't handle applications).
 */
export function TechniciansTab({ onGoToApplications }: { onGoToApplications?: () => void }) {
  const { t, p } = useI18n();
  const list = trpc.tech.list.useQuery();
  const [search, setSearch] = useState("");
  const techs = list.data ?? [];

  if (list.isLoading) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-navy" />;
  if (techs.length === 0) {
    return (
      <div className="card-br mt-8 p-10 text-center">
        <p className="font-semibold text-navy/70">{p(t.dash4.noTechnicians)}</p>
        {onGoToApplications && (
          <button onClick={onGoToApplications} className="btn-pill-primary mt-5">
            {p(t.dash4.goToApplications)}
          </button>
        )}
      </div>
    );
  }

  const term = search.trim().toLowerCase();
  const shown = term
    ? techs.filter((x) =>
        [x.name, x.email, x.phone, x.area, x.trade && CATEGORY_MAP[x.trade] ? p(CATEGORY_MAP[x.trade].name) : x.trade]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      )
    : techs;

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-navy">{p(t.dash4.techCount).replace("{n}", String(techs.length))}</p>
        <label className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={p(t.dash4.techSearch)}
            aria-label={p(t.dash4.techSearch)}
            className="h-10 w-full rounded-lg border border-navy/15 bg-white ps-9 pe-3 text-sm text-navy placeholder:text-navy/40 focus:border-navy/40 focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-navy/12 bg-white">
        {/* column headings, computers only */}
        <div className={`hidden gap-4 border-b border-navy/10 bg-navy/[0.03] px-4 py-2.5 lg:grid ${COLUMNS}`}>
          <span className={HEAD}>{p(t.dash4.techColumn)}</span>
          <span className={HEAD}>{p(t.dash4.techArea)}</span>
          <span className={HEAD}>{p(t.dash4.techExperience)}</span>
          <span className={HEAD}>{p(t.dash3.workMode)}</span>
          <span className={HEAD}>{p(t.prices.colTransport)}</span>
          <span className={`${HEAD} text-end`}>{p(t.dash4.activeJobs)}</span>
          <span className={`${HEAD} text-end`}>{p(t.dash4.completedJobs)}</span>
          <span className={`${HEAD} text-end`}>{p(t.dash4.rating)}</span>
          <span className={`${HEAD} text-end`}>{p(t.dash4.techActions)}</span>
        </div>
        {shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-navy/60">{p(t.dash4.techNoMatch)}</p>
        ) : (
          <ul className="divide-y divide-navy/10">
            {shown.map((x) => (
              <TechnicianRow key={x.id} tech={x} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TechnicianRow({ tech: x }: { tech: Technician }) {
  const { t, p } = useI18n();
  const [confirm, confirmDialog] = useConfirm();
  const utils = trpc.useUtils();
  const [showDocs, setShowDocs] = useState(false);
  const [editingTransport, setEditingTransport] = useState(false);
  const [editingDistricts, setEditingDistricts] = useState(false);
  // Their districts; older technicians who haven't any yet: the area they wrote.
  const where = x.districts.length ? x.districts.map((d) => p(DISTRICT_INFO[d].name)).join(", ") : (x.area ?? p(t.districts.none));
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const remove = trpc.tech.remove.useMutation({
    onSuccess: () => {
      void utils.tech.list.invalidate();
      void utils.join.list.invalidate();
      void utils.specialist.queue.invalidate(); // released jobs need a technician again
    },
  });
  const docs = trpc.join.documents.useQuery({ id: x.applicationId ?? 0 }, { enabled: showDocs && !!x.applicationId });
  const trade = x.trade ? CATEGORY_MAP[x.trade] : null;
  const works = x.workMode ? (x.workMode === "company" && x.companyName ? x.companyName : p(WORK_MODE_STAFF_LABELS[x.workMode])) : "-";
  // On phones each value carries its own label (the headings row is for computers).
  const cell = (label: string, value: string, end = false) => (
    <div className={`flex min-w-0 justify-between gap-3 text-sm lg:block ${end ? "lg:text-end" : ""}`}>
      <span className="text-xs text-navy/55 lg:hidden">{label}</span>
      <span className="truncate font-semibold text-navy">{value}</span>
    </div>
  );

  return (
    <li>
      {confirmDialog}
      <div className={`grid gap-2 px-4 py-3.5 lg:items-center lg:gap-4 ${COLUMNS}`}>
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={x.name} photoUrl={x.photoUrl} size="h-10 w-10" />
          <div className="min-w-0">
            <p className="flex min-w-0 items-center gap-1.5 font-display text-sm font-extrabold text-navy">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${x.online ? "bg-green-600" : "bg-navy/25"}`}
                title={p(x.online ? t.prices.available : t.prices.offline)}
                aria-label={p(x.online ? t.prices.available : t.prices.offline)}
              />
              <span className="truncate">{x.name ?? "-"}</span>
            </p>
            {trade && (
              <p className="flex items-center gap-1 text-xs font-semibold text-bird">
                <ServiceIcon id={x.trade!} className="h-3.5 w-3.5" /> {p(trade.name)}
              </p>
            )}
            <p className="truncate text-xs text-navy/55" dir="ltr">
              <span className="block text-start">{[x.phone, x.email].filter(Boolean).join(" · ")}</span>
            </p>
          </div>
        </div>
        {cell(p(t.dash4.techArea), where)}
        {cell(p(t.dash4.techExperience), x.experience ? p(EXPERIENCE_LABELS[x.experience as ExperienceLevel]) : "-")}
        {cell(p(t.dash3.workMode), works)}
        <div className="flex min-w-0 justify-between gap-3 text-sm lg:block">
          <span className="text-xs text-navy/55 lg:hidden">{p(t.prices.colTransport)}</span>
          <span className="min-w-0 text-end lg:text-start">
            <span className="block truncate font-semibold text-navy">{x.transport ? p(TRANSPORT_LABELS[x.transport]) : "-"}</span>
            <span className={`block truncate text-xs ${x.base ? "text-navy/55" : "font-semibold text-flame-ink"}`}>
              {p(x.base ? t.prices.startSet : t.prices.startMissing)}
            </span>
          </span>
        </div>
        {cell(p(t.dash4.activeJobs), String(x.activeJobs), true)}
        {cell(p(t.dash4.completedJobs), String(x.completedJobs), true)}
        <div className="flex justify-between gap-3 text-sm lg:block lg:text-end">
          <span className="text-xs text-navy/55 lg:hidden">{p(t.dash4.rating)}</span>
          {x.rating.average !== null ? (
            <span className="inline-flex items-center gap-1 font-semibold text-navy" title={`${x.rating.count}`}>
              <Star className="h-3.5 w-3.5 text-flame" fill="currentColor" aria-hidden />
              {x.rating.average.toFixed(1)}
              <span className="text-xs font-normal text-navy/50">({x.rating.count})</span>
            </span>
          ) : (
            <span className="font-semibold text-navy/40">-</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-1 lg:justify-end lg:pt-0">
          {x.phone && (
            <>
              <a href={telLink(x.phone)} className={ICON_BTN} title={p(t.dash3.call)} aria-label={`${p(t.dash3.call)} ${x.name ?? ""}`}>
                <Phone className="h-4 w-4" />
              </a>
              <a
                href={whatsappLink(x.phone)}
                target="_blank"
                rel="noreferrer"
                className={ICON_BTN}
                title={p(t.dash3.whatsapp)}
                aria-label={`${p(t.dash3.whatsapp)} ${x.name ?? ""}`}
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            </>
          )}
          {x.email && (
            <a href={`mailto:${x.email}`} className={ICON_BTN} title={p(t.dash3.emailAction)} aria-label={`${p(t.dash3.emailAction)} ${x.name ?? ""}`}>
              <Mail className="h-4 w-4" />
            </a>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setEditingDistricts((v) => !v)}
              aria-expanded={editingDistricts}
              className={`${ICON_BTN} ${editingDistricts ? "bg-navy text-white hover:bg-navy" : ""}`}
              title={p(t.districts.edit)}
              aria-label={`${p(t.districts.edit)} ${x.name ?? ""}`}
            >
              <Map className="h-4 w-4" />
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setEditingTransport((v) => !v)}
              aria-expanded={editingTransport}
              className={`${ICON_BTN} ${editingTransport ? "bg-navy text-white hover:bg-navy" : ""}`}
              title={p(t.prices.colTransport)}
              aria-label={`${p(t.prices.colTransport)} ${x.name ?? ""}`}
            >
              <Car className="h-4 w-4" />
            </button>
          )}
          {isAdmin && x.applicationId && (
            <button
              type="button"
              onClick={() => setShowDocs((v) => !v)}
              aria-expanded={showDocs}
              className={`${ICON_BTN} ${showDocs ? "bg-navy text-white hover:bg-navy" : ""}`}
              title={p(showDocs ? t.dash4.hideDocuments : t.dash4.documents)}
              aria-label={p(showDocs ? t.dash4.hideDocuments : t.dash4.documents)}
            >
              <FileText className="h-4 w-4" />
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: p(t.dash4.removeConfirm).replace("{name}", x.name ?? x.email ?? ""),
                  confirmLabel: p(t.dash2.remove),
                  tone: "danger",
                });
                if (ok) remove.mutate({ technicianId: x.id });
              }}
              className={`${ICON_BTN} border-red-700/30 text-red-700 hover:bg-red-700/5`}
              title={p(t.dash2.remove)}
              aria-label={`${p(t.dash2.remove)} ${x.name ?? ""}`}
            >
              <UserMinus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {remove.error && <p className="px-4 pb-3 text-xs font-semibold text-red-700">{remove.error.message}</p>}

      {editingTransport && <TransportEditor tech={x} onDone={() => setEditingTransport(false)} />}
      {editingDistricts && <DistrictsEditor tech={x} onDone={() => setEditingDistricts(false)} />}

      {showDocs && (
        <div className="border-t border-navy/10 bg-navy/[0.02] px-4 py-3">
          {docs.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-navy" />
          ) : (
            <ul className="flex flex-wrap gap-2 text-xs">
              {/* only the documents this technician's application has (the server lists those) */}
              {APPLICATION_DOCUMENTS.filter((kind) => !docs.data || kind in docs.data).map((kind) => {
                const doc = docs.data?.[kind];
                return (
                  <Fragment key={kind}>
                    {doc ? (
                      <li>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-navy/15 bg-white px-2.5 font-semibold text-navy hover:bg-navy/5"
                        >
                          <FileText className="h-3.5 w-3.5" /> {p(t.docs[kind])}
                        </a>
                      </li>
                    ) : (
                      <li className="inline-flex h-8 items-center px-1 font-semibold text-navy/50">
                        {p(t.docs[kind])}: {p(t.docs.missing)}
                      </li>
                    )}
                  </Fragment>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

