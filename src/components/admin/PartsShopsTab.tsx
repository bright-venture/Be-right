import { useState, type FormEvent, type ReactNode } from "react";
import { Clock, Loader2, MapPin, Pencil, Phone, Plus, Trash2, Wrench } from "lucide-react";
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

/**
 * Admin → Parts shops: the partner shops technicians can pick parts up from (for free, under
 * a written agreement; Be Right pays them monthly outside the app). Add, change, hide, delete.
 */
export function PartsShopsTab() {
  const { t, p } = useI18n();
  const shops = trpc.shops.all.useQuery();
  // null: closed; "new": adding; a shop: editing it.
  const [editing, setEditing] = useState<Shop | "new" | null>(null);
  const rows = shops.data ?? [];

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
        <ul className="mt-5 grid gap-3 md:grid-cols-2">
          {rows.map((s) => (
            <ShopCard key={s.id} shop={s} onEdit={() => setEditing(s)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ShopCard({ shop: s, onEdit }: { shop: Shop; onEdit: () => void }) {
  const { t, p } = useI18n();
  const [confirm, confirmDialog] = useConfirm();
  const utils = trpc.useUtils();
  const remove = trpc.shops.remove.useMutation({ onSuccess: () => utils.shops.all.invalidate() });

  return (
    <li className={`flex flex-col gap-2 rounded-2xl border border-navy/12 bg-white p-4 ${s.active ? "" : "opacity-60"}`}>
      {confirmDialog}
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy/[0.06] text-navy">
          <Wrench className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-display text-[15px] font-extrabold text-navy">
            {s.name}
            {!s.active && <span className="rounded-md bg-navy/[0.06] px-1.5 py-0.5 text-[11px] font-bold text-navy/70">{p(t.parts.paused)}</span>}
          </p>
          <p className="flex items-start gap-1 text-xs text-navy/70">
            <MapPin className="mt-px h-3.5 w-3.5 shrink-0" /> {s.address}
          </p>
          {s.hours && (
            <p className="flex items-center gap-1 text-xs text-navy/70">
              <Clock className="h-3.5 w-3.5 shrink-0" /> {s.hours}
            </p>
          )}
        </div>
      </div>
      <p className="flex flex-wrap gap-1.5">
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
      {s.note && <p className="rounded-lg bg-navy/[0.04] px-3 py-2 text-xs text-navy/80">{s.note}</p>}
      <div className="mt-1 flex flex-wrap gap-2">
        <a href={telLink(s.phone)} className={`${BTN} border border-navy/15 text-navy hover:bg-navy/5`}>
          <Phone className="h-4 w-4" /> <span dir="ltr">{s.phone}</span>
        </a>
        <button type="button" onClick={onEdit} className={`${BTN} border border-navy/15 text-navy hover:bg-navy/5`}>
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
          className={`${BTN} border border-red-700/40 text-red-700 hover:bg-red-700/5`}
        >
          <Trash2 className="h-4 w-4" /> {p(t.parts.remove)}
        </button>
      </div>
      {remove.error && <p className="text-xs font-semibold text-red-700">{remove.error.message}</p>}
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
