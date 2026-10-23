import { useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown, Clock, Loader2, MapPin, Pencil, Phone, Plus, Search, Trash2, Wrench } from "lucide-react";
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
import {
  CLOSE_TIMES,
  DAY_PRESETS,
  formatSchedule,
  isValidSchedule,
  OPEN_TIMES,
  WEEK_DAYS,
  type ShopSchedule,
} from "@contracts/shops";

type Shop = inferRouterOutputs<AppRouter>["shops"]["all"][number];

const INPUT =
  "mt-1.5 h-10 w-full rounded-lg border border-navy/15 bg-white px-3 text-sm text-navy placeholder:text-navy/35 focus:border-navy/40 focus:outline-none focus:ring-2 focus:ring-flame/20";
const LABEL = "text-xs font-medium text-navy/65";
const BTN = "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold disabled:opacity-50";
const CHIP = "min-h-9 rounded-lg border px-2 text-xs font-semibold transition-colors";

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={LABEL}>{label}</span>
      {children}
    </label>
  );
}

/** Columns on a computer: shop, parts for, status, and call and details (fixed width, so the
 * headings line up with every row). */
const COLUMNS = "lg:grid-cols-[minmax(0,2.2fr)_minmax(0,2fr)_6rem_6.5rem]";
const HEAD = "text-[11px] font-semibold uppercase tracking-wide text-navy/50";
const ICON_BTN =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-navy/15 text-navy transition-colors hover:bg-navy/5 disabled:opacity-40";
const ACTION = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors disabled:opacity-40";

/** A shop's opening hours, picked (newer shops) or as typed (older ones). */
function useHoursText() {
  const { lang } = useI18n();
  return (s: { schedule: ShopSchedule | null; hours: string | null }) => (s.schedule ? formatSchedule(s.schedule, lang) : s.hours || "-");
}

/**
 * Admin → Parts shops: the partner shops technicians can pick parts up from (for free, under
 * a written agreement; Be Right pays them monthly outside the app). One short row per shop, as
 * in the Technicians tab; the rest, and editing, in the row's details. Add, change, hide, delete.
 */
export function PartsShopsTab() {
  const { t, p } = useI18n();
  const shops = trpc.shops.all.useQuery();
  const [adding, setAdding] = useState(false);
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
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={`${BTN} bg-navy text-white hover:bg-navy/90`}>
            <Plus className="h-4 w-4" /> {p(t.parts.add)}
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-5">
          <ShopForm shop={null} onDone={() => setAdding(false)} />
        </div>
      )}

      {shops.isLoading ? (
        <Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-navy" />
      ) : rows.length === 0 ? (
        !adding && <p className="mt-6 rounded-2xl border border-dashed border-navy/20 bg-white p-8 text-center text-sm text-navy/60">{p(t.parts.empty)}</p>
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
              <span className={HEAD}>{p(t.parts.colStatus)}</span>
              <span />
            </div>
            {shown.length === 0 ? (
              <p className="p-6 text-center text-sm text-navy/60">{p(t.parts.noMatch)}</p>
            ) : (
              <ul className="divide-y divide-navy/10">
                {shown.map((s) => (
                  <ShopRow key={s.id} shop={s} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ShopRow({ shop: s }: { shop: Shop }) {
  const { t, p } = useI18n();
  const [confirm, confirmDialog] = useConfirm();
  const utils = trpc.useUtils();
  const hoursText = useHoursText();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const remove = trpc.shops.remove.useMutation({ onSuccess: () => utils.shops.all.invalidate() });
  const tradeName = (id: string) => (CATEGORY_MAP[id] ? p(CATEGORY_MAP[id].name) : id);
  // In the row: two trades, then "+3"; all of them in the details.
  const firstTrades = s.trades.slice(0, 2);
  const moreTrades = s.trades.length - firstTrades.length;
  const tag = "rounded-md bg-navy/[0.06] px-2 py-0.5 text-xs font-semibold text-navy/80";

  return (
    <li>
      {confirmDialog}
      <div className={`grid gap-2 px-4 py-3.5 lg:items-center lg:gap-4 ${COLUMNS} ${s.active ? "" : "bg-navy/[0.02]"}`}>
        {/* the shop */}
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 items-start gap-3 text-start">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.active ? "bg-navy/[0.06] text-navy" : "bg-navy/[0.04] text-navy/40"}`}
          >
            <Wrench className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className={`block truncate font-display text-sm font-extrabold ${s.active ? "text-navy" : "text-navy/50"}`}>{s.name}</span>
            <span className="flex items-start gap-1 text-xs text-navy/60">
              <MapPin className="mt-px h-3.5 w-3.5 shrink-0" /> <span className="line-clamp-1">{s.address}</span>
            </span>
          </span>
        </button>
        {/* what it supplies, and whether technicians see it */}
        <p className="flex min-w-0 flex-wrap items-center gap-1">
          {s.trades.length === 0 ? (
            <span className={tag}>{p(t.parts.allTrades)}</span>
          ) : (
            <>
              {firstTrades.map((id) => (
                <span key={id} className={tag}>
                  {tradeName(id)}
                </span>
              ))}
              {moreTrades > 0 && <span className="text-xs font-semibold text-navy/55">+{moreTrades}</span>}
            </>
          )}
        </p>
        <p>
          <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${s.active ? "bg-green-700/10 text-green-800" : "bg-navy/[0.06] text-navy/60"}`}>
            {p(s.active ? t.parts.shown : t.parts.paused)}
          </span>
        </p>
        {/* call, or see more */}
        <div className="flex items-center gap-1.5 pt-1 lg:justify-end lg:pt-0">
          <a href={telLink(s.phone)} className={ICON_BTN} title={p(t.parts.call)} aria-label={`${p(t.parts.call)} ${s.name}`}>
            <Phone className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`${ICON_BTN} ms-auto lg:ms-0 ${open ? "bg-navy text-white hover:bg-navy" : ""}`}
            title={p(t.parts.details)}
            aria-label={`${p(t.parts.details)} ${s.name}`}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-navy/10 bg-navy/[0.02] px-4 py-4">
          {editing ? (
            <ShopForm shop={s} onDone={() => setEditing(false)} />
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
                <div className="min-w-0">
                  <dt className="text-xs text-navy/55">{p(t.parts.phone)}</dt>
                  <dd className="truncate text-sm font-semibold text-navy" dir="ltr">
                    <span className="block text-start">{s.phone}</span>
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-navy/55">{p(t.parts.hours)}</dt>
                  <dd className="flex items-center gap-1 text-sm font-semibold text-navy">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-navy/45" /> {hoursText(s)}
                  </dd>
                </div>
                <div className="col-span-2 min-w-0">
                  <dt className="text-xs text-navy/55">{p(t.parts.trades)}</dt>
                  <dd className="mt-0.5 flex flex-wrap gap-1">
                    {s.trades.length === 0 ? (
                      <span className={tag}>{p(t.parts.allTrades)}</span>
                    ) : (
                      s.trades.map((id) => (
                        <span key={id} className={tag}>
                          {tradeName(id)}
                        </span>
                      ))
                    )}
                  </dd>
                </div>
                {s.note && (
                  <div className="col-span-2 min-w-0 lg:col-span-4">
                    <dt className="text-xs text-navy/55">{p(t.parts.note)}</dt>
                    <dd className="text-sm italic text-navy/80">{s.note}</dd>
                  </div>
                )}
              </dl>

              <p className={`${HEAD} mt-5`}>{p(t.dash4.techManage)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setEditing(true)} className={`${ACTION} border-navy/15 bg-white text-navy hover:bg-navy/5`}>
                  <Pencil className="h-4 w-4" /> {p(t.parts.edit)}
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
                  className={`${ACTION} ms-auto border-red-700/30 bg-white text-red-700 hover:bg-red-700/5`}
                >
                  <Trash2 className="h-4 w-4" /> {p(t.parts.remove)}
                </button>
              </div>
              {remove.error && <p className="mt-2 text-xs font-semibold text-red-700">{remove.error.message}</p>}
            </>
          )}
        </div>
      )}
    </li>
  );
}

/** Opening hours from lists: the days (with quick picks), then opening and closing times. */
function HoursPicker({
  days,
  onDays,
  open,
  onOpen,
  close,
  onClose,
  allDay,
  onAllDay,
}: {
  days: number[];
  onDays: (days: number[]) => void;
  open: string;
  onOpen: (v: string) => void;
  close: string;
  onClose: (v: string) => void;
  allDay: boolean;
  onAllDay: (v: boolean) => void;
}) {
  const { t, p } = useI18n();
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((d) => b.includes(d));
  const toggle = (d: number) => onDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b));
  const time = (v: string) => v.replace(/^0/, "");

  return (
    <div>
      <p className={LABEL}>{p(t.parts.days)}</p>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        {DAY_PRESETS.map((preset) => {
          const on = same(days, preset.days);
          return (
            <button
              key={preset.label.en}
              type="button"
              aria-pressed={on}
              onClick={() => onDays(on ? [] : preset.days)}
              className={`${CHIP} ${on ? "border-navy bg-navy text-white" : "border-navy/15 bg-white text-navy hover:bg-navy/5"}`}
            >
              {p(preset.label)}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1">
        {WEEK_DAYS.map((label, d) => {
          const on = days.includes(d);
          return (
            <button
              key={label.en}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(d)}
              className={`${CHIP} px-0.5 ${on ? "border-navy bg-navy text-white" : "border-navy/15 bg-white text-navy hover:bg-navy/5"}`}
            >
              {p(label)}
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label={p(t.parts.opens)}>
          <select value={open} onChange={(e) => onOpen(e.target.value)} disabled={allDay} className={`${INPUT} disabled:opacity-40`}>
            <option value="">{p(t.parts.choose)}</option>
            {OPEN_TIMES.map((v) => (
              <option key={v} value={v}>
                {time(v)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={p(t.parts.closes)}>
          <select value={close} onChange={(e) => onClose(e.target.value)} disabled={allDay} className={`${INPUT} disabled:opacity-40`}>
            <option value="">{p(t.parts.choose)}</option>
            {CLOSE_TIMES.filter((v) => !open || v > open).map((v) => (
              <option key={v} value={v}>
                {time(v)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm font-semibold text-navy">
        <input type="checkbox" checked={allDay} onChange={(e) => onAllDay(e.target.checked)} className="h-4 w-4 accent-navy" />
        {p(t.parts.allDay)}
      </label>
    </div>
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
  const [days, setDays] = useState<number[]>(shop?.schedule?.days ?? []);
  const [opens, setOpens] = useState(shop?.schedule?.open ?? "");
  const [closes, setCloses] = useState(shop?.schedule?.close ?? "");
  const [allDay, setAllDay] = useState(!!shop?.schedule?.allDay);
  const [note, setNote] = useState(shop?.note ?? "");
  const [active, setActive] = useState(shop?.active ?? true);
  const [problem, setProblem] = useState<"details" | "hours" | null>(null);
  const save = trpc.shops.save.useMutation({
    onSuccess: () => {
      void utils.shops.all.invalidate();
      onDone();
    },
  });

  // Hours are optional; once any part is picked, they must make sense.
  const touchedHours = days.length > 0 || !!opens || !!closes || allDay;
  const schedule: ShopSchedule | null = touchedHours ? (allDay ? { days, allDay: true } : { days, open: opens, close: closes }) : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const ok = name.trim().length >= 2 && isValidPhone(phone) && address.trim().length >= 3 && !!pin && isValidPin(pin.lat, pin.lng);
    const hoursOk = !schedule || isValidSchedule(schedule);
    setProblem(!ok ? "details" : !hoursOk ? "hours" : null);
    if (!ok || !hoursOk || !pin) return;
    save.mutate({
      id: shop?.id,
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      lat: pin.lat,
      lng: pin.lng,
      trades,
      schedule,
      note: note.trim() || undefined,
      active,
    });
  }

  const toggle = (id: string) => setTrades((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  return (
    <form onSubmit={submit} className="grid gap-5 rounded-2xl border border-navy/12 bg-white p-4 sm:p-5 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Field label={p(t.parts.name)}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} className={INPUT} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={p(t.parts.phone)}>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" dir="ltr" maxLength={64} className={INPUT} />
          </Field>
          <Field label={p(t.parts.address)}>
            <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={1000} className={INPUT} />
          </Field>
        </div>
        <div>
          <p className="text-sm font-bold text-navy">{p(t.parts.hours)}</p>
          {shop?.hours && !shop.schedule && (
            <p className="mb-1 text-xs text-navy/60">{p(t.parts.oldHours).replace("{hours}", shop.hours)}</p>
          )}
          <HoursPicker
            days={days}
            onDays={setDays}
            open={opens}
            onOpen={(v) => {
              setOpens(v);
              if (closes && v && closes <= v) setCloses("");
            }}
            close={closes}
            onClose={setCloses}
            allDay={allDay}
            onAllDay={setAllDay}
          />
        </div>
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
            {problem === "details" ? p(t.parts.need) : problem === "hours" ? p(t.parts.hoursNeed) : save.error?.message}
          </p>
        )}
      </div>
    </form>
  );
}
