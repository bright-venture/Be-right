import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown, Loader2, Search, Star } from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { StatusBadge } from "@/components/requests/RequestParts";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { formatMoment } from "@/lib/time";
import { CATEGORY_MAP, STATUS_ORDER, type RequestStatus } from "@contracts/services";

const CARD = "rounded-3xl border border-navy/10 bg-white p-5";
const H2 = "font-display text-lg font-extrabold text-navy";

function Loading() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-7 w-7 animate-spin text-navy" />
    </div>
  );
}

/** A big number with what it counts. */
function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className={`${CARD} flex flex-col gap-1`}>
      <span className="text-xs font-semibold text-navy/60">{label}</span>
      <span className="font-display text-3xl font-black tabular-nums text-navy">{value}</span>
      {hint && <span className="text-xs text-navy/50">{hint}</span>}
    </div>
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
export function OverviewTab() {
  const { t, p } = useI18n();
  const { data } = trpc.admin.overview.useQuery(undefined, { refetchInterval: 60_000 });
  if (!data) return <Loading />;

  const by = data.requests.byStatus;
  const open = STATUS_ORDER.filter((s) => s !== "completed").reduce((sum, s) => sum + (by[s] ?? 0), 0);
  const fill = (text: string, n: number) => text.replace("{n}", String(n));

  return (
    <div className="mt-8 flex flex-col gap-8">
      <section>
        <h2 className={`${H2} mb-3`}>{p(t.admin.requestsTitle)}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={p(t.admin.week)} value={data.requests.week} />
          <Stat label={p(t.admin.month)} value={data.requests.month} />
          <Stat label={p(t.admin.open)} value={open} />
          <Stat label={p(t.admin.completed)} value={by.completed ?? 0} hint={`${p(t.admin.cancelled)}: ${by.cancelled ?? 0}`} />
        </div>
      </section>

      <section>
        <h2 className={`${H2} mb-3`}>{p(t.admin.moneyTitle)}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={p(t.admin.jobValue)} value={money(data.money.completedValue)} />
          <Stat
            label={p(t.admin.visitFees)}
            value={money(data.money.visitFees)}
            hint={fill(p(t.admin.visitFeeJobs), data.money.visitFeeJobs)}
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
          <Stat label={p(t.admin.newApplications)} value={data.applications.new ?? 0} />
        </div>
      </section>

      <section>
        <h2 className={`${H2} mb-3`}>{p(t.admin.peopleTitle)}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={p(t.admin.customers)} value={data.people.customer ?? 0} />
          <Stat label={p(t.admin.technicians)} value={data.people.technician ?? 0} />
          <Stat label={p(t.admin.specialists)} value={data.people.specialist ?? 0} />
          <Stat label={p(t.admin.admins)} value={data.people.admin ?? 0} />
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
  const { data } = trpc.admin.customers.useQuery();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const day = (d: Date | string | null) =>
    d ? new Date(d).toLocaleDateString(lang === "ar" ? "ar-LB" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-";

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((c) => [c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(q)));
  }, [data, query]);

  if (!data) return <Loading />;
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
        <span className="text-sm font-semibold text-navy/60">{p(t.admin.customerCount).replace("{n}", String(shown.length))}</span>
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
  const utils = trpc.useUtils();
  const { data } = trpc.admin.team.useQuery();
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
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_2fr]">
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
          <Loading />
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
                  </div>
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
                        onClick={() => {
                          if (window.confirm(p(t.admin.removeAsk).replace("{name}", m.name || m.email || ""))) {
                            setStaffRole.mutate({ userId: m.id, role: "customer" });
                          }
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
        {setStaffRole.error && <p role="alert" className="mt-3 text-sm font-semibold text-destructive">{setStaffRole.error.message}</p>}
      </section>
    </div>
  );
}

/** What happened on requests, newest first, and who did it. */
export function ActivityTab() {
  const { t, p, lang } = useI18n();
  const { data } = trpc.admin.activity.useQuery(undefined, { refetchInterval: 60_000 });
  if (!data) return <Loading />;
  if (data.length === 0) return <p className="mt-8 text-sm text-navy/60">{p(t.admin.noActivity)}</p>;

  const labels = { ...t.status, ...t.events } as Record<string, { en: string; ar: string }>;
  const roles = { customer: t.app.roleCustomer, technician: t.app.roleTechnician, specialist: t.app.roleSpecialist, admin: t.app.roleAdmin };

  return (
    <ol className="mt-8 flex flex-col gap-2">
      {data.map((e) => (
        <li key={e.id} className="grid grid-cols-[auto_1fr] gap-x-3 rounded-2xl border border-navy/10 bg-white p-4">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-navy/5 text-bird">
            <ServiceIcon id={e.category ?? ""} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-bold text-navy">{labels[e.status] ? p(labels[e.status]) : e.status}</span>
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
    </ol>
  );
}

