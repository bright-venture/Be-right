import { useState, type ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { ServiceIcon } from "@/components/ServiceIcon";
import { CATEGORY_MAP, CUSTOMER_SERVICES } from "@contracts/services";
import { TRANSPORT, TRANSPORT_LABELS, type Transport } from "@contracts/applications";
import { MAX_PRICE_USD, type PricingSettings } from "@contracts/pricing";
import { VISIT_FEE_USD } from "@contracts/legal";

const HEAD = "text-[11px] font-semibold uppercase tracking-wide text-navy/50";
const NUMBER =
  "h-9 w-full rounded-lg border border-navy/15 bg-white px-3 text-end text-sm font-semibold text-navy placeholder:font-normal placeholder:text-navy/35 focus:border-navy/40 focus:outline-none focus:ring-2 focus:ring-flame/20 aria-[invalid=true]:border-red-700";

/** Every amount as typed (empty = not set). */
type Form = {
  services: Record<string, string>;
  perKm: Record<Transport, string>;
  maxKm: Record<Transport, string>;
  minimum: string;
};

const text = (n: number | null | undefined) => (n == null ? "" : String(n));
const keyed = <K extends string>(keys: readonly K[], value: (k: K) => string) =>
  Object.fromEntries(keys.map((k) => [k, value(k)])) as Record<K, string>;

function toForm(s: PricingSettings): Form {
  return {
    services: keyed(CUSTOMER_SERVICES, (id) => text(s.services[id])),
    perKm: keyed(TRANSPORT, (m) => text(s.transport[m]?.perKm)),
    maxKm: keyed(TRANSPORT, (m) => text(s.transport[m]?.maxKm)),
    minimum: text(s.minimum),
  };
}

/** A typed amount: null when empty, NaN when it isn't a usable number. */
function amount(v: string, max = MAX_PRICE_USD) {
  const s = v.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return /^\d+(\.\d{1,2})?$/.test(s) && n <= max ? n : NaN;
}

function toSettings(f: Form): PricingSettings | null {
  const bad = (n: number | null) => n !== null && Number.isNaN(n);
  const services: PricingSettings["services"] = {};
  const transport: PricingSettings["transport"] = {};
  const all: (number | null)[] = [];
  for (const id of CUSTOMER_SERVICES) {
    const n = amount(f.services[id]);
    all.push(n);
    if (n !== null) services[id] = n;
  }
  for (const m of TRANSPORT) {
    const perKm = amount(f.perKm[m]);
    const maxKm = amount(f.maxKm[m], 2000);
    all.push(perKm, maxKm);
    if (perKm !== null || maxKm !== null) transport[m] = { perKm, maxKm };
  }
  const minimum = amount(f.minimum);
  all.push(minimum);
  return all.some(bad) ? null : { services, transport, minimum };
}

function Card({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-navy/12 bg-white">
      <div className="border-b border-navy/10 px-4 py-3">
        <h3 className="font-display text-sm font-extrabold text-navy">{title}</h3>
        <p className="mt-0.5 text-xs text-navy/60">{hint}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Admin → Prices: the fixed prices suggested prices are made of (contracts/pricing.ts):
 * a price per service, a rate per km and a max distance per transport, and the lowest price.
 */
export function PricesTab() {
  const current = trpc.pricing.get.useQuery();
  if (!current.data) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-navy" />;
  return <PricesForm initial={current.data} />;
}

function PricesForm({ initial }: { initial: PricingSettings }) {
  const { t, p } = useI18n();
  const utils = trpc.useUtils();
  const [form, setForm] = useState(() => toForm(initial));
  const [dirty, setDirty] = useState(false);
  const save = trpc.pricing.save.useMutation({
    onSuccess: () => {
      setDirty(false);
      void utils.pricing.invalidate();
    },
  });
  const settings = toSettings(form);
  const fee = `$${VISIT_FEE_USD}`;

  const set = (change: (f: Form) => Form) => {
    setForm(change);
    setDirty(true);
    save.reset();
  };
  const input = (value: string, onChange: (v: string) => void, label: string, max?: number) => (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputMode="decimal"
      aria-label={label}
      aria-invalid={Number.isNaN(amount(value, max)) || undefined}
      className={NUMBER}
    />
  );

  return (
    <div className="mt-8">
      <div className="max-w-3xl">
        <h2 className="font-display text-base font-extrabold text-navy">{p(t.prices.title)}</h2>
        <p className="mt-0.5 text-sm text-navy/65">{p(t.prices.sub)}</p>
        <p className="mt-3 rounded-xl border border-navy/12 bg-navy/[0.03] px-4 py-3 text-sm font-semibold text-navy">{p(t.prices.formula)}</p>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <Card title={p(t.prices.services)} hint={p(t.prices.servicesHint).replace("{fee}", fee)}>
          <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-x-4 border-b border-navy/10 bg-navy/[0.03] px-4 py-2">
            <span className={HEAD}>{p(t.prices.colService)}</span>
            <span className={`${HEAD} text-end`}>{p(t.prices.price)}</span>
          </div>
          <ul className="divide-y divide-navy/10">
            {CUSTOMER_SERVICES.map((id) => {
              const name = CATEGORY_MAP[id] ? p(CATEGORY_MAP[id].name) : id;
              return (
                <li key={id} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-x-4 px-4 py-1.5">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-navy">
                    <ServiceIcon id={id} className="h-4 w-4 shrink-0 text-bird" />
                    <span className="truncate">{name}</span>
                  </span>
                  {input(form.services[id], (v) => set((f) => ({ ...f, services: { ...f.services, [id]: v } })), `${name}: ${p(t.prices.price)}`)}
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="flex flex-col gap-5">
          <Card title={p(t.prices.travel)} hint={p(t.prices.travelHint)}>
            <div className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] gap-x-3 border-b border-navy/10 bg-navy/[0.03] px-4 py-2">
              <span className={HEAD}>{p(t.prices.colTransport)}</span>
              <span className={`${HEAD} text-end`}>{p(t.prices.perKm)}</span>
              <span className={`${HEAD} text-end`}>{p(t.prices.maxKm)}</span>
            </div>
            <ul className="divide-y divide-navy/10">
              {TRANSPORT.map((m) => (
                <li key={m} className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] items-center gap-x-3 px-4 py-1.5">
                  <span className="truncate text-sm font-semibold text-navy">{p(TRANSPORT_LABELS[m])}</span>
                  {input(form.perKm[m], (v) => set((f) => ({ ...f, perKm: { ...f.perKm, [m]: v } })), `${p(TRANSPORT_LABELS[m])}: ${p(t.prices.perKm)}`)}
                  {input(form.maxKm[m], (v) => set((f) => ({ ...f, maxKm: { ...f.maxKm, [m]: v } })), `${p(TRANSPORT_LABELS[m])}: ${p(t.prices.maxKm)}`, 2000)}
                </li>
              ))}
            </ul>
          </Card>

          <Card title={p(t.prices.minimum)} hint={p(t.prices.minimumHint).replace("{fee}", fee)}>
            <div className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-x-4 px-4 py-3">
              <span className="text-sm font-semibold text-navy">{p(t.prices.minimum)}</span>
              {input(form.minimum, (v) => set((f) => ({ ...f, minimum: v })), p(t.prices.minimum))}
            </div>
          </Card>
        </div>
      </div>

      <div className="sticky bottom-4 z-10 mt-6 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-navy/12 bg-white/95 px-4 py-3 shadow-[0_6px_18px_rgb(12_43_92/0.10)] backdrop-blur">
        {!settings && <p className="me-auto text-sm font-semibold text-red-700">{p(t.prices.invalid)}</p>}
        {save.error && <p className="me-auto text-sm font-semibold text-red-700">{save.error.message}</p>}
        {save.isSuccess && !dirty && (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-bird">
            <Check className="h-4 w-4" /> {p(t.prices.saved)}
          </span>
        )}
        <button
          type="button"
          disabled={!settings || !dirty || save.isPending}
          onClick={() => settings && save.mutate(settings)}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-navy px-4 text-sm font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {p(t.prices.save)}
        </button>
      </div>
    </div>
  );
}
