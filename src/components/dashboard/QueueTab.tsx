import { useEffect, useMemo, useState } from "react";
import { Clock, Loader2, Search } from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { CATEGORIES, CATEGORY_MAP, URGENCY_META, type RequestStatus, type UrgencyLevel } from "@contracts/services";
import { URGENCY_LEVELS } from "@contracts/workflow";
import { RequestDetail } from "./RequestDetail";
import { useLiveQueue } from "./useLiveQueue";
import { cancelPending, inView, NEEDS_SPECIALIST, URGENCY_DOT, urgencyOf, waitingFor, type QueueView } from "./queueMeta";

const SELECT =
  "min-h-11 rounded-2xl border-2 border-navy/30 bg-white px-3 text-sm font-semibold text-navy focus:border-flame focus:outline-none";

export function QueueTab({ onGoToApplications }: { onGoToApplications?: () => void }) {
  const { t, p } = useI18n();
  const queue = useLiveQueue();
  const technicians = trpc.tech.list.useQuery();
  const [view, setView] = useState<QueueView>("open");
  const [search, setSearch] = useState("");
  const [urgency, setUrgency] = useState<UrgencyLevel | "">("");
  const [service, setService] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  const rows = useMemo(() => queue.data ?? [], [queue.data]);
  const counters = useMemo(
    () =>
      (["needsAction", "waitingCustomer", "inProgress", "urgent", "doneToday"] as const).map((v) => ({
        view: v,
        count: rows.filter((x) => inView(v, x.request)).length,
      })),
    [rows],
  );

  const term = search.trim().toLowerCase().replace(/^#/, "");
  const filtered = rows.filter(({ request: r, customerName, customerEmail }) => {
    if (!inView(view, r)) return false;
    if (urgency && urgencyOf(r) !== urgency) return false;
    if (service && r.category !== service) return false;
    if (!term) return true;
    const haystack = [String(r.id), customerName, customerEmail, r.phone, r.area, r.address]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(term) || haystack.replace(/\s/g, "").includes(term.replace(/\s/g, ""));
  });
  const filtersActive = view !== "open" || !!urgency || !!service || !!term;

  // Requests closed over 30 days ago aren't in the live queue: they load on demand, a page at a time.
  const showsClosed = view === "completed" || view === "cancelled" || view === "all";
  const [older, setOlder] = useState(false);
  const [olderTerm, setOlderTerm] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setOlderTerm(term), 300);
    return () => clearTimeout(id);
  }, [term]);
  const history = trpc.specialist.history.useInfiniteQuery(
    {
      status: view === "completed" || view === "cancelled" ? view : null,
      category: service || null,
      search: olderTerm || null,
    },
    { enabled: older && showsClosed, getNextPageParam: (last) => last.nextCursor },
  );
  const olderRows =
    older && showsClosed
      ? (history.data?.pages.flatMap((page) => page.items) ?? []).filter((x) => !urgency || urgencyOf(x.request) === urgency)
      : [];
  const listed = [...filtered, ...olderRows];

  const counterLabel = {
    needsAction: t.dash4.needsAction,
    waitingCustomer: t.dash4.waitingCustomer,
    inProgress: t.dash4.inProgress,
    urgent: t.dash4.urgentOpen,
    doneToday: t.dash4.doneToday,
  };

  return (
    <div className="mt-8">
      {/* overview: each counter is also a quick filter */}
      {/* Five counters: one row on wide screens; two per row below, the fifth across the full width. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 max-lg:[&>*:last-child:nth-child(odd)]:col-span-2">
        {counters.map((c) => (
          <button
            key={c.view}
            onClick={() => setView(view === c.view ? "open" : c.view)}
            aria-pressed={view === c.view}
            className={`card-br p-4 text-start transition-all hover:-translate-y-0.5 ${
              view === c.view ? "!border-flame !bg-flame/5" : ""
            }`}
          >
            <span
              className={`block font-display text-3xl font-black ${
                c.view === "urgent" && c.count > 0 ? "text-flame-ink" : "text-navy"
              }`}
            >
              {c.count}
            </span>
            <span className="mt-1 block text-xs font-bold text-navy/70">{p(counterLabel[c.view])}</span>
          </button>
        ))}
      </div>

      {/* filters */}
      {/* Phones: search and status across the width, urgency and service side by side. */}
      <div className="mt-5 grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
        <label className="relative col-span-2 min-w-60 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/50" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={p(t.dash4.search)}
            aria-label={p(t.dash4.search)}
            className={`${SELECT} w-full ps-9`}
          />
        </label>
        <select value={view} onChange={(e) => setView(e.target.value as QueueView)} aria-label={p(t.requests.status)} className={`${SELECT} col-span-2`}>
          <option value="open">{p(t.dash4.viewOpen)}</option>
          <option value="needsAction">{p(t.dash4.needsAction)}</option>
          <option value="waitingCustomer">{p(t.dash4.waitingCustomer)}</option>
          <option value="inProgress">{p(t.dash4.inProgress)}</option>
          <option value="urgent">{p(t.dash4.urgentOpen)}</option>
          <option value="doneToday">{p(t.dash4.doneToday)}</option>
          <option value="completed">{p(t.dash4.viewCompleted)}</option>
          <option value="cancelled">{p(t.dash4.viewCancelled)}</option>
          <option value="all">{p(t.dash4.viewAll)}</option>
        </select>
        <select value={urgency} onChange={(e) => setUrgency(e.target.value as UrgencyLevel | "")} aria-label={p(t.requests.urgency)} className={`${SELECT} min-w-0`}>
          <option value="">{p(t.dash4.anyUrgency)}</option>
          {URGENCY_LEVELS.map((u) => (
            <option key={u} value={u}>
              {p(URGENCY_META[u].label)}
            </option>
          ))}
        </select>
        <select value={service} onChange={(e) => setService(e.target.value)} aria-label={p(t.book.stepCategory)} className={`${SELECT} min-w-0`}>
          <option value="">{p(t.dash4.anyService)}</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {p(c.name)}
            </option>
          ))}
        </select>
        {filtersActive && (
          <button
            onClick={() => {
              setView("open");
              setUrgency("");
              setService("");
              setSearch("");
            }}
            className="col-span-2 justify-self-start text-sm font-bold text-navy underline underline-offset-4"
          >
            {p(t.dash4.clearFilters)}
          </button>
        )}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* list */}
        {/* p-1: room for borders and focus outlines inside the scroll box */}
        <div className="flex flex-col gap-2 p-1 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
          {queue.isLoading && <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-navy" />}
          {!queue.isLoading && listed.length === 0 && !(older && history.isLoading) && (
            <div className="card-br p-8 text-center text-sm font-semibold text-navy/70">
              {rows.length === 0 ? p(t.dash.empty) : p(t.dash4.noMatches)}
            </div>
          )}
          {listed.map(({ request: r, customerName, customerEmail }) => {
            const level = urgencyOf(r);
            const status = r.status as RequestStatus;
            const wait = NEEDS_SPECIALIST.includes(status) ? waitingFor(r.updatedAt) : null;
            return (
              <button
                key={r.id}
                onClick={() => {
                  setSelected(r.id);
                  // On phones the details sit below the list: bring them into view.
                  if (window.matchMedia("(max-width: 1023px)").matches) {
                    requestAnimationFrame(() =>
                      document.getElementById("request-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                    );
                  }
                }}
                aria-current={selected === r.id ? "true" : undefined}
                className={`card-br flex items-center gap-3 p-3 text-start transition-colors hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame ${
                  selected === r.id ? "!border-flame !bg-flame/5" : ""
                }`}
              >
                <span className={`h-3 w-3 shrink-0 rounded-full ${URGENCY_DOT[level]}`} title={p(URGENCY_META[level].label)} />
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-navy/15 bg-paper text-bird">
                  <ServiceIcon id={r.category} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-sm font-extrabold text-navy">
                    #{r.id} · {CATEGORY_MAP[r.category] ? p(CATEGORY_MAP[r.category].name) : r.category}
                  </span>
                  <span className="block truncate text-xs text-navy/70">
                    {customerName ?? customerEmail ?? "-"} · {r.area}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full border border-navy/25 px-2 py-px text-[10px] font-bold text-navy">
                      {p(t.status[status])}
                    </span>
                    {r.guaranteeFor && (
                      <span className="rounded-full bg-bird px-2 py-px text-[10px] font-bold text-white">
                        {p(t.requests.guaranteeBadge)}
                      </span>
                    )}
                    {cancelPending(r) && (
                      <span className="rounded-full bg-red-700 px-2 py-px text-[10px] font-bold text-white">
                        {p(t.dash4.cancelAsked)}
                      </span>
                    )}
                    {wait && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-[10px] font-bold ${
                          wait.hours >= 24 ? "bg-red-700 text-white" : wait.hours >= 4 ? "bg-flame-ink text-white" : "bg-navy/10 text-navy"
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        {p(t.dash4.waiting).replace("{time}", wait.label)}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
          {showsClosed && !queue.isLoading && (!older || history.hasNextPage || history.isFetching) && (
            <button
              type="button"
              onClick={() => (older ? void history.fetchNextPage() : setOlder(true))}
              disabled={history.isFetching}
              className="btn-pill-outline mt-2 !min-h-10 justify-center text-sm disabled:opacity-50"
            >
              {history.isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
              {p(older ? t.admin.loadMore : t.dash4.showOlder)}
            </button>
          )}
        </div>

        {/* detail */}
        <div id="request-detail" className="min-w-0 scroll-mt-20">
          {selected !== null ? (
            <RequestDetail
              id={selected}
              technicians={technicians.data ?? []}
              onGoToApplications={onGoToApplications}
            />
          ) : (
            <div className="card-br hidden min-h-60 items-center justify-center p-8 text-center text-sm font-semibold text-navy/70 lg:flex">
              {p(t.dash4.selectRequest)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
