import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import {
  BadgeCheck,
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  FileText,
  KeyRound,
  Car,
  Loader2,
  MapPin,
  Search,
  Star,
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
import { StatusBadge } from "@/components/requests/RequestParts";
import { ServiceSpecialists } from "./ServiceSpecialists";
import { useI18n } from "@/i18n";
import { useConfirm } from "@/hooks/useConfirm";
import { trpc } from "@/providers/trpc";
import { formatMoment, meetingDate } from "@/lib/time";
import { CATEGORY_MAP, forWorker, STATUS_ORDER, type RequestStatus } from "@contracts/services";
import type { AuditAction } from "@contracts/audit";
import { arabicDigits } from "@contracts/legal";

const CARD = "rounded-3xl border border-navy/10 bg-white p-5";
const H2 = "font-display text-lg font-extrabold text-navy";

/** Still loading, or it failed: then say why and offer to try again (never an endless spinner). */
function Pending({ error, retry }: { error?: { message: string } | null; retry?: () => void }) {
  const { t, p } = useI18n();
  if (error) {
    return (
      <div role="alert" className="mt-8 flex flex-col items-center gap-3 rounded-3xl border border-destructive/30 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-destructive">
          {/fetch|network/i.test(error.message) ? p(t.misc.offline) : error.message}
        </p>
        {retry && (
          <button type="button" onClick={retry} className="btn-pill-outline !min-h-10 !px-5 text-sm">
            {p(t.admin.retry)}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-7 w-7 animate-spin text-navy" />
    </div>
  );
}

/** "Show more" under a list loaded a page at a time. */
function LoadMore({ list }: { list: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
  const { t, p } = useI18n();
  if (!list.hasNextPage) return null;
  return (
    <button
      type="button"
      onClick={() => void list.fetchNextPage()}
      disabled={list.isFetchingNextPage}
      className="btn-pill-outline mx-auto mt-4 !min-h-10 !px-6 text-sm disabled:opacity-50"
    >
      {list.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
      {p(t.admin.loadMore)}
    </button>
  );
}

/**
 * A big number, what it counts, and a line explaining it. Same structure in every card, from
 * the top, so the numbers in a row line up whatever the label's length. With `onClick`, the
 * card opens the tab it's about.
 */
function Stat({
  label,
  value,
  hint,
  onClick,
  highlight,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  onClick?: () => void;
  highlight?: boolean;
}) {
  const body = (
    <>
      <span className="text-xs font-bold text-navy/70">{label}</span>
      <span className={`font-display text-3xl font-black tabular-nums ${highlight ? "text-flame-ink" : "text-navy"}`}>{value}</span>
      {hint && <span className="text-xs leading-snug text-navy/60">{hint}</span>}
    </>
  );
  const box = `${CARD} flex h-full flex-col items-start justify-start gap-1 text-start`;
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${box} transition-colors hover:border-navy/30 ${highlight ? "!border-flame/40 !bg-flame/5" : ""}`}
    >
      {body}
    </button>
  ) : (
    <div className={box}>{body}</div>
  );
}

/** A ranked list with bars sized against the largest value. */
function Ranking({ title, rows }: { title: string; rows: { key: string; label: ReactNode; n: number }[] }) {
  const { t, p } = useI18n();
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className={CARD}>
      <h3 className={H2}>{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-navy/60">{p(t.admin.none)}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-semibold text-navy">{r.label}</span>
                <span className="font-bold tabular-nums text-navy">{r.n}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-navy/5">
                <div className="h-2 rounded-full bg-flame" style={{ width: `${(r.n / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Figures at a glance: requests, money, people, demand. */
/** The numbers at a glance; the "Needs attention" cards open their tab. */
export function OverviewTab({ onOpen }: { onOpen?: (tab: "requests" | "applications") => void }) {
  const { t, p } = useI18n();
  const { data, error, refetch } = trpc.admin.overview.useQuery(undefined, { refetchInterval: 60_000 });
  if (!data) return <Pending error={error} retry={() => void refetch()} />;

  const by = data.requests.byStatus;
  const open = STATUS_ORDER.filter((s) => s !== "completed").reduce((sum, s) => sum + (by[s] ?? 0), 0);
  // The team's move: new, being reviewed, or approved by the customer and waiting for a technician.
  const waiting = (by.submitted ?? 0) + (by.in_review ?? 0) + (by.approved ?? 0);
  const toReview = (data.applications.new ?? 0) + (data.applications.contacted ?? 0);
  const completed = by.completed ?? 0;
  const fill = (text: string, n: number) => text.replace("{n}", String(n));
  // Four per row on wide screens, two on phones: every row full.
  const ROW = "grid grid-cols-2 gap-3 lg:grid-cols-4";

  return (
    <div className="mt-8 flex flex-col gap-8">
      <section>
        <h2 className={`${H2} mb-3`}>{p(t.admin.attentionTitle)}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label={p(t.admin.waitingRequests)}
            value={waiting}
            hint={p(t.admin.waitingRequestsHint)}
            highlight={waiting > 0}
            onClick={onOpen && (() => onOpen("requests"))}
          />
          <Stat
            label={p(t.admin.applicationsToReview)}
            value={toReview}
            hint={p(t.admin.applicationsToReviewHint)}
            highlight={toReview > 0}
            onClick={onOpen && (() => onOpen("applications"))}
          />
        </div>
      </section>

      <section>
        <h2 className={`${H2} mb-3`}>{p(t.admin.requestsTitle)}</h2>
        <div className={ROW}>
          <Stat label={p(t.admin.week)} value={data.requests.week} hint={p(t.admin.weekHint)} />
          <Stat label={p(t.admin.month)} value={data.requests.month} hint={p(t.admin.monthHint)} />
          <Stat label={p(t.admin.open)} value={open} hint={p(t.admin.openHint)} />
          <Stat label={p(t.admin.completed)} value={completed} hint={`${p(t.admin.cancelled)}: ${by.cancelled ?? 0}`} />
        </div>
      </section>

      <section>
        <h2 className={`${H2} mb-3`}>{p(t.admin.moneyTitle)}</h2>
        <div className={ROW}>
          <Stat label={p(t.admin.jobValue)} value={money(data.money.completedValue)} hint={p(t.admin.jobValueHint)} />
          <Stat
            label={p(t.admin.visitFees)}
            value={money(data.money.visitFees)}
            hint={fill(p(t.admin.visitFeeJobs), data.money.visitFeeJobs)}
          />
          <Stat
            label={p(t.admin.averageJob)}
            value={completed ? money(Math.round(data.money.completedValue / completed)) : "-"}
            hint={p(t.admin.averageJobHint)}
          />
          <Stat
            label={p(t.admin.rating)}
            value={
              data.rating.average === null ? (
                "-"
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  {data.rating.average.toFixed(1)}
                  <Star className="h-6 w-6 text-flame" fill="currentColor" />
                </span>
              )
            }
            hint={fill(p(t.admin.ratings), data.rating.count)}
          />
        </div>
      </section>

      <section>
        <h2 className={`${H2} mb-3`}>{p(t.admin.peopleTitle)}</h2>
        <div className={ROW}>
          <Stat label={p(t.admin.customers)} value={data.people.customer ?? 0} hint={p(t.admin.customersHint)} />
          <Stat label={p(t.admin.technicians)} value={data.people.technician ?? 0} hint={p(t.admin.techniciansHint)} />
          <Stat label={p(t.admin.specialists)} value={data.people.specialist ?? 0} hint={p(t.admin.specialistsHint)} />
          <Stat label={p(t.admin.admins)} value={data.people.admin ?? 0} hint={p(t.admin.adminsHint)} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Ranking
          title={p(t.admin.byStatus)}
          rows={[...STATUS_ORDER, "cancelled" as const].map((s) => ({
            key: s,
            label: p(t.status[s as RequestStatus]),
            n: by[s] ?? 0,
          }))}
        />
        <Ranking
          title={p(t.admin.topServices)}
          rows={data.topServices.map((r) => ({
            key: r.category,
            label: (
              <span className="inline-flex items-center gap-2">
                <ServiceIcon id={r.category} className="h-4 w-4 text-bird" />
                {CATEGORY_MAP[r.category] ? p(CATEGORY_MAP[r.category].name) : r.category}
              </span>
            ),
            n: r.n,
          }))}
        />
        <Ranking title={p(t.admin.topAreas)} rows={data.topAreas.map((r) => ({ key: r.area, label: r.area, n: r.n }))} />
      </div>
    </div>
  );
}

/** Every customer account: search, and open one to see their requests. */
export function CustomersTab() {
  const { t, p, lang } = useI18n();
  const [query, setQuery] = useState("");
  // Searched on the server (there may be thousands): a moment after typing stops.
  const [search, setSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);
  const list = trpc.admin.customers.useInfiniteQuery(
    { search: search || null },
    { getNextPageParam: (last) => last.nextCursor, placeholderData: keepPreviousData },
  );
  const [open, setOpen] = useState<number | null>(null);
  const day = (d: Date | string | null) =>
    d ? new Date(d).toLocaleDateString(lang === "ar" ? "ar" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-";

  if (!list.data) return <Pending error={list.error} retry={() => void list.refetch()} />;
  const shown = list.data.pages.flatMap((page) => page.items);
  const total = list.data.pages[0]?.total ?? shown.length;
  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={p(t.admin.searchPh)}
            aria-label={p(t.admin.searchPh)}
            className="min-h-11 w-full rounded-2xl border-2 border-navy/20 bg-white pe-4 ps-10 text-sm font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none"
          />
        </label>
        <span className="text-sm font-semibold text-navy/60">{p(t.admin.customerCount).replace("{n}", String(total))}</span>
      </div>

      {shown.length === 0 ? (
        <p className="mt-6 text-sm text-navy/60">{p(t.admin.noResults)}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {shown.map((c) => (
            <li key={c.id} className="overflow-hidden rounded-2xl border border-navy/10 bg-white">
              <button
                type="button"
                onClick={() => setOpen(open === c.id ? null : c.id)}
                aria-expanded={open === c.id}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-3 p-4 text-start sm:grid-cols-[2fr_2fr_1fr_1fr_auto]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold text-navy">{c.name || "-"}</span>
                  {c.deletedAt && <span className="text-xs font-bold text-destructive">{p(t.admin.deleted)}</span>}
                </span>
                <span className="hidden min-w-0 text-sm text-navy/70 sm:block" dir="ltr">
                  <span className="block truncate text-start">{c.email}</span>
                  <span className="block truncate text-start">{c.phone}</span>
                </span>
                <span className="hidden text-sm text-navy/70 sm:block">
                  <span className="block text-xs text-navy/50">{p(t.admin.joined)}</span>
                  {day(c.createdAt)}
                </span>
                <span className="hidden text-sm text-navy/70 sm:block">
                  <span className="block text-xs text-navy/50">{p(t.admin.lastRequest)}</span>
                  {day(c.lastRequestAt)}
                </span>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-navy/5 px-2.5 py-0.5 text-xs font-bold tabular-nums text-navy">{c.requests}</span>
                  <ChevronDown className={`h-4 w-4 text-navy/40 transition-transform ${open === c.id ? "rotate-180" : ""}`} />
                </span>
              </button>
              {open === c.id && <CustomerRequests id={c.id} email={c.email} phone={c.phone} lastSignIn={day(c.lastSignInAt)} />}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-center">
        <LoadMore list={list} />
      </div>
    </div>
  );
}

function CustomerRequests({ id, email, phone, lastSignIn }: { id: number; email: string | null; phone: string | null; lastSignIn: string }) {
  const { t, p, lang } = useI18n();
  const { data } = trpc.admin.customerRequests.useQuery({ id });
  return (
    <div className="border-t border-navy/10 bg-paper p-4">
      <p className="text-sm text-navy/70 sm:hidden" dir="ltr">
        {email} · {phone}
      </p>
      <p className="text-xs text-navy/50">
        {p(t.admin.lastSignIn)}: {lastSignIn}
      </p>
      {!data ? (
        <Loader2 className="mt-3 h-5 w-5 animate-spin text-navy" />
      ) : data.length === 0 ? (
        <p className="mt-3 text-sm text-navy/60">{p(t.admin.noRequests)}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm">
              <ServiceIcon id={r.category} className="h-4 w-4 text-bird" />
              <span className="font-bold text-navy">
                #{r.id} {CATEGORY_MAP[r.category] ? p(CATEGORY_MAP[r.category].name) : r.category}
              </span>
              <span className="text-navy/60">{r.area}</span>
              <span className="text-navy/60">{formatMoment(r.createdAt, lang)}</span>
              <span className="ms-auto flex items-center gap-2">
                {r.visitFeeReason ? (
                  <span className="font-bold tabular-nums text-navy">${r.visitFee}</span>
                ) : (
                  r.quoteAmount && <span className="font-bold tabular-nums text-navy">${r.quoteAmount}</span>
                )}
                <StatusBadge status={r.status as RequestStatus} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Specialists and admins: add people, change roles, take people off the team. */
export function TeamTab() {
  const { t, p, lang } = useI18n();
  const [confirm, confirmDialog] = useConfirm();
  const utils = trpc.useUtils();
  const { data, error, refetch } = trpc.admin.team.useQuery();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"specialist" | "admin">("specialist");
  const [notice, setNotice] = useState<string | null>(null);
  const add = trpc.admin.addStaff.useMutation({
    onSuccess: ({ invited }, vars) => {
      setNotice(p(invited ? t.admin.invited : t.admin.added).replace("{email}", vars.email));
      setEmail("");
      void utils.admin.team.invalidate();
    },
  });
  const setStaffRole = trpc.admin.setStaffRole.useMutation({ onSuccess: () => utils.admin.team.invalidate() });
  const resetTwoStep = trpc.admin.resetTwoStep.useMutation({
    onSuccess: (_, vars) => {
      const member = data?.find((m) => m.id === vars.userId);
      setNotice(p(t.admin.twoStepResetDone).replace("{name}", member?.name || member?.email || ""));
      void utils.admin.team.invalidate();
    },
  });
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const roleLabel = { specialist: t.admin.roleSpecialist, admin: t.admin.roleAdmin } as const;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (valid) {
      setNotice(null);
      add.mutate({ email: email.trim(), role });
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <form onSubmit={submit} className={`${CARD} flex h-fit flex-col gap-3`}>
          <h2 className={H2}>{p(t.admin.addTitle)}</h2>
          <p className="text-sm text-navy/60">{p(t.admin.addHint)}</p>
          <input
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={p(t.admin.emailPh)}
            aria-label={p(t.admin.emailPh)}
            className="min-h-11 rounded-2xl border-2 border-navy/20 bg-white px-4 text-sm font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none"
          />
          <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-2xl bg-navy/5 p-1">
            {(["specialist", "admin"] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                onClick={() => setRole(r)}
                className={`min-h-10 rounded-xl text-sm font-bold ${role === r ? "bg-white text-navy shadow-[0_2px_8px_rgb(12_43_92/0.1)]" : "text-navy/60"}`}
              >
                {p(roleLabel[r])}
              </button>
            ))}
          </div>
          <button type="submit" disabled={!valid || add.isPending} className="btn-pill-primary justify-center disabled:opacity-40">
            {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {p(t.admin.add)}
          </button>
          {notice && <p role="status" className="text-sm font-semibold text-green-800">{notice}</p>}
          {add.error && <p role="alert" className="text-sm font-semibold text-destructive">{add.error.message}</p>}
        </form>

        <section>
          {!data ? (
            <Pending error={error} retry={() => void refetch()} />
          ) : (
            <ul className="flex flex-col gap-2">
              {data.map((m) => {
                const locked = m.isYou || m.fromSettings;
                return (
                  <li key={m.id} className={`${CARD} flex flex-wrap items-center gap-3 !py-4`}>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-bold text-navy">
                        {m.name || m.email}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            m.role === "admin" ? "bg-navy text-white" : "bg-bird/10 text-bird"
                          }`}
                        >
                          {p(roleLabel[m.role as "specialist" | "admin"])}
                        </span>
                        {m.isYou && <span className="text-xs font-semibold text-navy/50">({p(t.admin.you)})</span>}
                        {m.twoStep !== null && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              m.twoStep ? "bg-green-700/10 text-green-800" : "bg-flame/10 text-flame"
                            }`}
                          >
                            {p(m.twoStep ? t.admin.twoStepOn : t.admin.twoStepOff)}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-sm text-navy/60" dir="ltr">
                        <span className="block text-start">
                          {m.email}
                          {m.phone ? ` · ${m.phone}` : ""}
                        </span>
                      </p>
                      <p className="text-xs text-navy/50">
                        {p(t.admin.lastSignIn)}: {formatMoment(m.lastSignInAt, lang)}
                        {m.fromSettings && ` · ${p(t.admin.fromSettings)}`}
                      </p>
                      {m.role === "specialist" && (
                        <p className={`mt-1 text-xs font-semibold ${m.services.length ? "text-bird" : "text-flame-ink"}`}>
                          {m.services.length
                            ? p(t.serviceOwners.theirs).replace(
                                "{list}",
                                m.services.map((s) => (CATEGORY_MAP[s] ? p(CATEGORY_MAP[s].name) : s)).join(" · "),
                              )
                            : p(t.serviceOwners.noneShort)}
                        </p>
                      )}
                    </div>
                    {!m.isYou && m.twoStep && (
                      <button
                        type="button"
                        disabled={resetTwoStep.isPending}
                        onClick={async () => {
                          const ok = await confirm({
                            title: p(t.admin.twoStepResetAsk).replace("{name}", m.name || m.email || ""),
                            confirmLabel: p(t.admin.twoStepReset),
                          });
                          if (ok) resetTwoStep.mutate({ userId: m.id });
                        }}
                        className="btn-pill-outline !min-h-10 w-full justify-center !px-3 text-xs sm:w-auto"
                      >
                        {p(t.admin.twoStepReset)}
                      </button>
                    )}
                    {!locked && (
                      <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
                        <button
                          type="button"
                          disabled={setStaffRole.isPending}
                          onClick={() => setStaffRole.mutate({ userId: m.id, role: m.role === "admin" ? "specialist" : "admin" })}
                          className="btn-pill-outline !min-h-10 justify-center !px-3 text-xs"
                        >
                          {p(m.role === "admin" ? t.admin.makeSpecialist : t.admin.makeAdmin)}
                        </button>
                        <button
                          type="button"
                          disabled={setStaffRole.isPending}
                          onClick={async () => {
                            const ok = await confirm({
                              title: p(t.admin.removeAsk).replace("{name}", m.name || m.email || ""),
                              confirmLabel: p(t.admin.remove),
                              tone: "danger",
                            });
                            if (ok) setStaffRole.mutate({ userId: m.id, role: "customer" });
                          }}
                          className="btn-pill-outline !min-h-10 justify-center !border-red-700 !px-3 text-xs !text-red-700"
                        >
                          {p(t.admin.remove)}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {confirmDialog}
          {(setStaffRole.error ?? resetTwoStep.error) && (
            <p role="alert" className="mt-3 text-sm font-semibold text-destructive">
              {(setStaffRole.error ?? resetTwoStep.error)?.message}
            </p>
          )}
        </section>
      </div>
      {data && <ServiceSpecialists specialists={data.filter((m) => m.role === "specialist")} />}
    </div>
  );
}

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

