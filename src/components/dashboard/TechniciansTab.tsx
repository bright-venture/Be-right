import { Fragment, useState, type ReactNode } from "react";
import { Car, ChevronDown, FileText, Loader2, Mail, Map, MessageCircle, Phone, Search, Star, UserMinus } from "lucide-react";
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

/** The table's columns on a computer: technician, districts, jobs, rating, and call, WhatsApp
 * and details (fixed width, so the headings line up with every row). */
const COLUMNS = "lg:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1.1fr)_5.5rem_9rem]";
const ICON_BTN =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-navy/15 text-navy transition-colors hover:bg-navy/5 disabled:opacity-40";
const HEAD = "text-[11px] font-semibold uppercase tracking-wide text-navy/50";
const ACTION = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors disabled:opacity-40";

/**
 * Every technician as one short row: who, where they work, their jobs and rating, and a call
 * or WhatsApp button. The rest is in the row's details: specialists only look and contact;
 * admins also change their districts and transport, open the hiring documents, or remove them.
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
        [
          x.name,
          x.email,
          x.phone,
          x.area,
          ...x.districts.map((d) => p(DISTRICT_INFO[d].name)),
          x.trade && CATEGORY_MAP[x.trade] ? p(CATEGORY_MAP[x.trade].name) : x.trade,
        ]
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
          <span className={HEAD}>{p(t.dash4.techJobs)}</span>
          <span className={HEAD}>{p(t.dash4.rating)}</span>
          <span />
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
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [open, setOpen] = useState(false);
  // One admin tool open at a time, under the details.
  const [tool, setTool] = useState<"districts" | "transport" | "docs" | null>(null);
  const remove = trpc.tech.remove.useMutation({
    onSuccess: () => {
      void utils.tech.list.invalidate();
      void utils.join.list.invalidate();
      void utils.specialist.queue.invalidate(); // released jobs need a technician again
    },
  });
  const docs = trpc.join.documents.useQuery({ id: x.applicationId ?? 0 }, { enabled: tool === "docs" && !!x.applicationId });
  const trade = x.trade ? CATEGORY_MAP[x.trade] : null;
  // Their districts; older technicians who haven't any yet: the area they wrote.
  const where = x.districts.length ? x.districts.map((d) => p(DISTRICT_INFO[d].name)).join(", ") : (x.area ?? p(t.districts.none));
  const works = x.workMode ? (x.workMode === "company" && x.companyName ? x.companyName : p(WORK_MODE_STAFF_LABELS[x.workMode])) : "-";
  const toggleTool = (next: NonNullable<typeof tool>) => setTool((now) => (now === next ? null : next));
  const facts: [string, ReactNode][] = [
    [p(t.dash4.techAvailability), p(x.online ? t.prices.available : t.prices.offline)],
    [p(t.join.phone), x.phone ? <span dir="ltr">{x.phone}</span> : "-"],
    [p(t.join.email), x.email ? <a href={`mailto:${x.email}`} className="underline underline-offset-2">{x.email}</a> : "-"],
    [p(t.dash4.techExperience), x.experience ? p(EXPERIENCE_LABELS[x.experience as ExperienceLevel]) : "-"],
    [p(t.dash3.workMode), works],
    [p(t.prices.colTransport), x.transport ? p(TRANSPORT_LABELS[x.transport]) : "-"],
    [
      p(t.prices.start),
      <span className={x.base ? "" : "font-semibold text-flame-ink"}>{p(x.base ? t.prices.startSet : t.prices.startMissing)}</span>,
    ],
  ];

  return (
    <li>
      {confirmDialog}
      <div className={`grid gap-2 px-4 py-3.5 lg:items-center lg:gap-4 ${COLUMNS}`}>
        {/* who */}
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 items-center gap-3 text-start">
          <Avatar name={x.name} photoUrl={x.photoUrl} size="h-10 w-10" />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5 font-display text-sm font-extrabold text-navy">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${x.online ? "bg-green-600" : "bg-navy/25"}`}
                title={p(x.online ? t.prices.available : t.prices.offline)}
                aria-label={p(x.online ? t.prices.available : t.prices.offline)}
              />
              <span className="truncate">{x.name ?? "-"}</span>
            </span>
            {trade && (
              <span className="flex items-center gap-1 text-xs font-semibold text-bird">
                <ServiceIcon id={x.trade!} className="h-3.5 w-3.5" /> {p(trade.name)}
              </span>
            )}
          </span>
        </button>
        {/* where, how busy, how good: on phones each with its label */}
        <p className="flex min-w-0 justify-between gap-3 text-sm lg:block">
          <span className="text-xs text-navy/55 lg:hidden">{p(t.dash4.techArea)}</span>
          <span className="truncate font-semibold text-navy">{where}</span>
        </p>
        <p className="flex min-w-0 justify-between gap-3 text-sm lg:block">
          <span className="text-xs text-navy/55 lg:hidden">{p(t.dash4.techJobs)}</span>
          <span className="text-navy">
            {p(t.dash4.techJobsCell).replace("{a}", String(x.activeJobs)).replace("{d}", String(x.completedJobs))}
          </span>
        </p>
        <p className="flex justify-between gap-3 text-sm lg:block">
          <span className="text-xs text-navy/55 lg:hidden">{p(t.dash4.rating)}</span>
          {x.rating.average !== null ? (
            <span className="inline-flex items-center gap-1 font-semibold text-navy">
              <Star className="h-3.5 w-3.5 text-flame" fill="currentColor" aria-hidden />
              {x.rating.average.toFixed(1)}
              <span className="text-xs font-normal text-navy/50">({x.rating.count})</span>
            </span>
          ) : (
            <span className="font-semibold text-navy/40">-</span>
          )}
        </p>
        {/* reach them, or see more */}
        <div className="flex items-center gap-1.5 pt-1 lg:justify-end lg:pt-0">
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
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`${ICON_BTN} ms-auto lg:ms-0 ${open ? "bg-navy text-white hover:bg-navy" : ""}`}
            title={p(t.dash4.techDetails)}
            aria-label={`${p(t.dash4.techDetails)} ${x.name ?? ""}`}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-navy/10 bg-navy/[0.02] px-4 py-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
            {facts.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-navy/55">{label}</dt>
                <dd className="truncate text-sm font-semibold text-navy">{value}</dd>
              </div>
            ))}
          </dl>

          {isAdmin && (
            <>
              <p className={`${HEAD} mt-5`}>{p(t.dash4.techManage)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleTool("districts")}
                  aria-expanded={tool === "districts"}
                  className={`${ACTION} ${tool === "districts" ? "border-navy bg-navy text-white" : "border-navy/15 bg-white text-navy hover:bg-navy/5"}`}
                >
                  <Map className="h-4 w-4" /> {p(t.districts.edit)}
                </button>
                <button
                  type="button"
                  onClick={() => toggleTool("transport")}
                  aria-expanded={tool === "transport"}
                  className={`${ACTION} ${tool === "transport" ? "border-navy bg-navy text-white" : "border-navy/15 bg-white text-navy hover:bg-navy/5"}`}
                >
                  <Car className="h-4 w-4" /> {p(t.prices.colTransport)}
                </button>
                {x.applicationId && (
                  <button
                    type="button"
                    onClick={() => toggleTool("docs")}
                    aria-expanded={tool === "docs"}
                    className={`${ACTION} ${tool === "docs" ? "border-navy bg-navy text-white" : "border-navy/15 bg-white text-navy hover:bg-navy/5"}`}
                  >
                    <FileText className="h-4 w-4" /> {p(t.dash4.documents)}
                  </button>
                )}
                {x.email && (
                  <a href={`mailto:${x.email}`} className={`${ACTION} border-navy/15 bg-white text-navy hover:bg-navy/5`}>
                    <Mail className="h-4 w-4" /> {p(t.dash3.emailAction)}
                  </a>
                )}
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
                  className={`${ACTION} ms-auto border-red-700/30 bg-white text-red-700 hover:bg-red-700/5`}
                >
                  <UserMinus className="h-4 w-4" /> {p(t.dash2.remove)}
                </button>
              </div>
              {remove.error && <p className="mt-2 text-xs font-semibold text-red-700">{remove.error.message}</p>}
            </>
          )}
        </div>
      )}

      {open && tool === "districts" && <DistrictsEditor tech={x} onDone={() => setTool(null)} />}
      {open && tool === "transport" && <TransportEditor tech={x} onDone={() => setTool(null)} />}
      {open && tool === "docs" && (
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
