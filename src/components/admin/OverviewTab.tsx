// Admin → Overview: the figures, and what needs attention.

import { type ReactNode } from "react";
import { Star } from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { CATEGORY_MAP, STATUS_ORDER, type RequestStatus } from "@contracts/services";
import { CARD, H2, Pending } from "./adminParts";

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
