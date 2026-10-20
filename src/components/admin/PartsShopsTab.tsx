import { useState, type FormEvent, type ReactNode } from "react";
import { Clock, Loader2, MapPin, Pencil, Phone, Plus, Search, Trash2, Wrench } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/router";
import { useI18n } from "@/i18n";
import { useConfirm } from "@/hooks/useConfirm";
import { trpc } from "@/providers/trpc";
import { telLink } from "@/lib/contact";
import LocationPicker, { type Pin } from "@/components/map/LocationPicker";
import { ServiceIcon } from "@/components/ServiceIcon";
import { isValidPin } from "@contracts/geo";
import { isValidPhone } from "@contracts/phone";
import { CATEGORY_MAP, SERVICES_IN_ORDER } from "@contracts/services";

type Shop = inferRouterOutputs<AppRouter>["shops"]["all"][number];

const INPUT =
  "mt-1.5 h-10 w-full rounded-lg border border-navy/15 bg-white px-3 text-sm text-navy placeholder:text-navy/35 focus:border-navy/40 focus:outline-none focus:ring-2 focus:ring-flame/20";
const LABEL = "text-xs font-medium text-navy/65";
const BTN = "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold disabled:opacity-50";

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={LABEL}>{label}</span>
      {children}
    </label>
  );
}

/** Columns on a computer: shop, parts for, hours, phone, status, and the buttons (fixed width,
 * so the headings line up with every row). */
const COLUMNS = "lg:grid-cols-[minmax(0,2.2fr)_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_5.5rem_8rem]";
const HEAD = "text-[11px] font-semibold uppercase tracking-wide text-navy/50";
const ICON_BTN =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-navy/15 text-navy transition-colors hover:bg-navy/5 disabled:opacity-40";

/**
 * Admin → Parts shops: the partner shops technicians can pick parts up from (for free, under
 * a written agreement; Be Right pays them monthly outside the app). One row per shop, as in
 * the Technicians tab. Add, change, hide, delete.
 */
export function PartsShopsTab() {
  const { t, p } = useI18n();
  const shops = trpc.shops.all.useQuery();
  // null: closed; "new": adding; a shop: editing it.
  const [editing, setEditing] = useState<Shop | "new" | null>(null);
  const [search, setSearch] = useState("");
  const rows = shops.data ?? [];
  const term = search.trim().toLowerCase();
  const shown = term
    ? rows.filter((s) =>
        [s.name, s.address, s.phone, ...s.trades.map((id) => (CATEGORY_MAP[id] ? p(CATEGORY_MAP[id].name) : id))].some((v) =>
          v.toLowerCase().includes(term),
        ),
      )
    : rows;

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="font-display text-base font-extrabold text-navy">{p(t.parts.title)}</h2>
          <p className="mt-0.5 text-sm text-navy/65">{p(t.parts.sub)}</p>
        </div>
        {editing === null && (
          <button type="button" onClick={() => setEditing("new")} className={`${BTN} bg-navy text-white hover:bg-navy/90`}>
            <Plus className="h-4 w-4" /> {p(t.parts.add)}
          </button>
        )}
      </div>

      {editing !== null && (
        <ShopForm key={editing === "new" ? "new" : editing.id} shop={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
      )}

      {shops.isLoading ? (
        <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-navy" />
      ) : rows.length === 0 ? (
        editing === null && <p className="mt-6 rounded-2xl border border-dashed border-navy/20 bg-white p-8 text-center text-sm text-navy/60">{p(t.parts.empty)}</p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-navy">{p(t.parts.count).replace("{n}", String(rows.length))}</p>
            <label className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={p(t.parts.search)}
                aria-label={p(t.parts.search)}
                className="h-10 w-full rounded-lg border border-navy/15 bg-white ps-9 pe-3 text-sm text-navy placeholder:text-navy/40 focus:border-navy/40 focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-3 overflow-hidden rounded-2xl border border-navy/12 bg-white">
            {/* column headings, computers only */}
            <div className={`hidden gap-4 border-b border-navy/10 bg-navy/[0.03] px-4 py-2.5 lg:grid ${COLUMNS}`}>
              <span className={HEAD}>{p(t.parts.colShop)}</span>
              <span className={HEAD}>{p(t.parts.trades)}</span>
              <span className={HEAD}>{p(t.parts.hours)}</span>
              <span className={HEAD}>{p(t.parts.phone)}</span>
              <span className={HEAD}>{p(t.parts.colStatus)}</span>
              <span className={`${HEAD} text-end`}>{p(t.dash4.techActions)}</span>
            </div>
            {shown.length === 0 ? (
              <p className="p-6 text-center text-sm text-navy/60">{p(t.parts.noMatch)}</p>
            ) : (
              <ul className="divide-y divide-navy/10">
                {shown.map((s) => (
                  <ShopRow key={s.id} shop={s} onEdit={() => setEditing(s)} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ShopRow({ shop: s, onEdit }: { shop: Shop; onEdit: () => void }) {
  const { t, p } = useI18n();
  const [confirm, confirmDialog] = useConfirm();
  const utils = trpc.useUtils();
  const remove = trpc.shops.remove.useMutation({ onSuccess: () => utils.shops.all.invalidate() });
  // On phones each value carries its own label (the headings row is for computers).
  const label = (text: string) => <span className="text-xs text-navy/55 lg:hidden">{text}</span>;

  return (
    <li>
      {confirmDialog}
      <div className={`grid gap-2 px-4 py-3.5 lg:items-center lg:gap-4 ${COLUMNS} ${s.active ? "" : "bg-navy/[0.02]"}`}>
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.active ? "bg-navy/[0.06] text-navy" : "bg-navy/[0.04] text-navy/40"}`}
          >
            <Wrench className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className={`truncate font-display text-sm font-extrabold ${s.active ? "text-navy" : "text-navy/50"}`}>{s.name}</p>
            <p className="flex items-start gap-1 text-xs text-navy/60">
              <MapPin className="mt-px h-3.5 w-3.5 shrink-0" /> <span className="line-clamp-1">{s.address}</span>
            </p>
            {s.note && <p className="line-clamp-1 text-xs italic text-navy/50">{s.note}</p>}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1 lg:block">
          {label(p(t.parts.trades))}
          <p className="flex flex-wrap gap-1">
            {s.trades.length === 0 ? (
              <span className="rounded-md bg-navy/[0.06] px-2 py-0.5 text-xs font-semibold text-navy/80">{p(t.parts.allTrades)}</span>
            ) : (
              s.trades.map((id) => (
                <span key={id} className="rounded-md bg-navy/[0.06] px-2 py-0.5 text-xs font-semibold text-navy/80">
                  {CATEGORY_MAP[id] ? p(CATEGORY_MAP[id].name) : id}
                </span>
              ))
            )}
          </p>
        </div>
        <div className="flex min-w-0 justify-between gap-3 text-sm lg:block">
          {label(p(t.parts.hours))}
          <span className="flex items-center gap-1 font-semibold text-navy">
            <Clock className="hidden h-3.5 w-3.5 shrink-0 text-navy/45 lg:block" /> {s.hours || "-"}
          </span>
        </div>
        <div className="flex min-w-0 justify-between gap-3 text-sm lg:block">
          {label(p(t.parts.phone))}
          <span className="truncate font-semibold text-navy" dir="ltr">
            {s.phone}
          </span>
        </div>
        <div className="flex justify-between gap-3 text-sm lg:block">
          {label(p(t.parts.colStatus))}
          <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${s.active ? "bg-green-700/10 text-green-800" : "bg-navy/[0.06] text-navy/60"}`}>
            {p(s.active ? t.parts.shown : t.parts.paused)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-1 lg:justify-end lg:pt-0">
          <a href={telLink(s.phone)} className={ICON_BTN} title={p(t.parts.call)} aria-label={`${p(t.parts.call)} ${s.name}`}>
            <Phone className="h-4 w-4" />
          </a>
          <button type="button" onClick={onEdit} className={ICON_BTN} title={p(t.parts.edit)} aria-label={`${p(t.parts.edit)} ${s.name}`}>
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={remove.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: p(t.parts.removeAsk).replace("{name}", s.name),
                message: p(t.parts.removeNote),
                confirmLabel: p(t.parts.remove),
                tone: "danger",
              });
              if (ok) remove.mutate({ id: s.id });
            }}
            className={`${ICON_BTN} border-red-700/30 text-red-700 hover:bg-red-700/5`}
            title={p(t.parts.remove)}
            aria-label={`${p(t.parts.remove)} ${s.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {remove.error && <p className="px-4 pb-3 text-xs font-semibold text-red-700">{remove.error.message}</p>}
    </li>
  );
}

function ShopForm({ shop, onDone }: { shop: Shop | null; onDone: () => void }) {
  const { t, p } = useI18n();
  const utils = trpc.useUtils();
  const [name, setName] = useState(shop?.name ?? "");
  const [phone, setPhone] = useState(shop?.phone ?? "");
  const [address, setAddress] = useState(shop?.address ?? "");
  const [pin, setPin] = useState<Pin | null>(shop ? { lat: shop.lat, lng: shop.lng } : null);
  const [trades, setTrades] = useState<string[]>(shop?.trades ?? []);
  const [hours, setHours] = useState(shop?.hours ?? "");
  const [note, setNote] = useState(shop?.note ?? "");
  const [active, setActive] = useState(shop?.active ?? true);
  const [problem, setProblem] = useState(false);
  const save = trpc.shops.save.useMutation({
    onSuccess: () => {
      void utils.shops.all.invalidate();
      onDone();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const ok = name.trim().length >= 2 && isValidPhone(phone) && address.trim().length >= 3 && !!pin && isValidPin(pin.lat, pin.lng);
    setProblem(!ok);
    if (!ok || !pin) return;
    save.mutate({
      id: shop?.id,
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      lat: pin.lat,
      lng: pin.lng,
      trades,
      hours: hours.trim() || undefined,
      note: note.trim() || undefined,
      active,
    });
  }

  const toggle = (id: string) => setTrades((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  return (
    <form onSubmit={submit} className="mt-5 grid gap-5 rounded-2xl border border-navy/12 bg-white p-4 sm:p-5 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Field label={p(t.parts.name)}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} className={INPUT} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={p(t.parts.phone)}>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" dir="ltr" maxLength={64} className={INPUT} />
          </Field>
          <Field label={p(t.parts.hours)}>
            <input value={hours} onChange={(e) => setHours(e.target.value)} maxLength={255} className={INPUT} />
          </Field>
        </div>
        <Field label={p(t.parts.address)}>
          <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={1000} className={INPUT} />
        </Field>
        <div>
          <p className={LABEL}>{p(t.parts.trades)}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SERVICES_IN_ORDER.map((id) => {
              const on = trades.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                    on ? "border-navy bg-navy text-white" : "border-navy/15 bg-white text-navy hover:bg-navy/5"
                  }`}
                >
                  <ServiceIcon id={id} className="h-4 w-4" />
                  {p(CATEGORY_MAP[id].name)}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-navy/55">{p(t.parts.tradesHint)}</p>
        </div>
        <Field label={p(t.parts.note)}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder={p(t.parts.notePh)}
            className="mt-1.5 w-full rounded-lg border border-navy/15 bg-white px-3 py-2 text-sm text-navy placeholder:text-navy/35 focus:border-navy/40 focus:outline-none focus:ring-2 focus:ring-flame/20"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm font-semibold text-navy">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-navy" />
          {p(t.parts.active)}
        </label>
      </div>
      <div className="flex flex-col gap-3">
        <p className={LABEL}>{p(t.parts.pin)}</p>
        <LocationPicker value={pin} onChange={setPin} staff tapHint={p(t.parts.pinTap)} />
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-navy/10 pt-4 lg:col-span-2">
        <button type="submit" disabled={save.isPending} className={`${BTN} bg-navy px-4 text-white hover:bg-navy/90`}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {p(t.parts.save)}
        </button>
        <button type="button" onClick={onDone} className={`${BTN} border border-navy/15 text-navy hover:bg-navy/5`}>
          {p(t.parts.cancel)}
        </button>
        {(problem || save.error) && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {problem ? p(t.parts.need) : save.error?.message}
          </p>
        )}
      </div>
    </form>
  );
}
