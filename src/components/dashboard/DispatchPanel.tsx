import { useState, type FormEvent } from "react";
import { Loader2, Send } from "lucide-react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import LocationPicker, { type Pin } from "@/components/map/LocationPicker";
import { directionsLinks } from "@contracts/geo";
import { isValidPhone } from "@contracts/phone";
import { CATEGORY_MAP } from "@contracts/services";
import { QUOTE_AMOUNT_PATTERN, todayHere } from "@contracts/workflow";

const INPUT =
  "mt-1.5 min-h-11 w-full rounded-xl border border-navy/20 bg-white px-3 text-sm font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none";
const LABEL = "text-[11px] font-bold uppercase tracking-[0.1em] text-navy/55";

type Emergency = {
  id: number;
  category: string;
  name: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
};

/** Now, as the visit's time of day. */
function slotNow(hour = new Date().getHours()) {
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

/**
 * Sends a technician to an emergency: where (the customer's shared pin, which the specialist
 * can move), who to call there, which technician (same trade first, least busy first) and the
 * price agreed on the phone. The emergency becomes a scheduled job in the technician's app.
 */
export function DispatchPanel({ e, onClose }: { e: Emergency; onClose: () => void }) {
  const { t, p } = useI18n();
  const utils = trpc.useUtils();
  const technicians = trpc.tech.list.useQuery();
  const [pin, setPin] = useState<Pin | null>(e.lat !== null && e.lng !== null ? { lat: e.lat, lng: e.lng } : null);
  const [address, setAddress] = useState(e.address ?? "");
  const [name, setName] = useState(e.name ?? "");
  const [phone, setPhone] = useState(e.phone ?? "");
  const [technicianId, setTechnicianId] = useState("");
  const [amount, setAmount] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const dispatch = trpc.emergency.dispatch.useMutation({
    onSuccess: () => {
      void utils.emergency.list.invalidate();
      void utils.specialist.queue.invalidate();
      onClose();
    },
  });

  const trade = CATEGORY_MAP[e.category];
  const sorted = [...(technicians.data ?? [])].sort(
    (a, b) => Number(b.trade === e.category) - Number(a.trade === e.category) || a.activeJobs - b.activeJobs,
  );
  const matching = sorted.filter((x) => x.trade === e.category);
  const others = sorted.filter((x) => x.trade !== e.category);
  const label = (x: (typeof sorted)[number]) =>
    [
      x.name ?? x.email,
      x.trade && CATEGORY_MAP[x.trade] ? p(CATEGORY_MAP[x.trade].name) : null,
      x.area,
      p(t.emergency.activeJobs).replace("{n}", String(x.activeJobs)),
    ]
      .filter(Boolean)
      .join(" · ");

  function submit(event: FormEvent) {
    event.preventDefault();
    const missing = !pin
      ? t.emergency.needPin
      : !address.trim()
        ? t.emergency.needAddress
        : !isValidPhone(phone)
          ? t.misc.phoneInvalid
          : !technicianId
            ? t.emergency.needTechnician
            : !QUOTE_AMOUNT_PATTERN.test(amount.trim())
              ? t.emergency.needPrice
              : null;
    setProblem(missing ? p(missing) : null);
    if (missing || !pin) return;
    dispatch.mutate({
      id: e.id,
      technicianId: Number(technicianId),
      amount: amount.trim(),
      name: name.trim() || undefined,
      phone: phone.trim(),
      address: address.trim(),
      lat: pin.lat,
      lng: pin.lng,
      visitDate: todayHere(),
      timeSlot: slotNow(),
    });
  }

  const links = pin ? directionsLinks(pin.lat, pin.lng) : null;

  return (
    <form onSubmit={submit} className="grid gap-5 border-t border-navy/10 bg-paper/60 p-4 ps-5 lg:grid-cols-2">
      {/* Where */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className={LABEL}>{p(t.emergency.whereLabel)}</p>
          {links && (
            <p className="flex gap-3 text-xs font-bold text-flame-ink">
              <a href={links.google} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Google Maps
              </a>
              <a href={links.waze} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Waze
              </a>
            </p>
          )}
        </div>
        <LocationPicker value={pin} onChange={setPin} />
        <label className="block">
          <span className={LABEL}>{p(t.book.address)}</span>
          <input value={address} onChange={(x) => setAddress(x.target.value)} maxLength={1000} placeholder={p(t.book.addressPh)} className={INPUT} />
        </label>
      </div>

      {/* Who and how much */}
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={LABEL}>{p(t.emergency.contactName)}</span>
            <input value={name} onChange={(x) => setName(x.target.value)} maxLength={255} className={INPUT} />
          </label>
          <label className="block">
            <span className={LABEL}>{p(t.emergency.contactPhone)}</span>
            <input value={phone} onChange={(x) => setPhone(x.target.value)} type="tel" dir="ltr" maxLength={32} placeholder={p(t.book.phonePh)} className={INPUT} />
          </label>
        </div>

        <label className="block">
          <span className={LABEL}>{p(t.emergency.technicianLabel)}</span>
          <select value={technicianId} onChange={(x) => setTechnicianId(x.target.value)} className={INPUT} disabled={technicians.isLoading}>
            <option value="">{technicians.isLoading ? "…" : sorted.length ? p(t.emergency.chooseTechnician) : p(t.emergency.noTechnicians)}</option>
            {matching.length > 0 && (
              <optgroup label={p(t.emergency.sameTrade).replace("{trade}", trade ? p(trade.name) : e.category)}>
                {matching.map((x) => (
                  <option key={x.id} value={x.id}>
                    {label(x)}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label={p(t.emergency.otherTechnicians)}>
                {others.map((x) => (
                  <option key={x.id} value={x.id}>
                    {label(x)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        <label className="block">
          <span className={LABEL}>{p(t.emergency.priceLabel)}</span>
          <input value={amount} onChange={(x) => setAmount(x.target.value)} inputMode="decimal" dir="ltr" placeholder="45" className={INPUT} />
        </label>

        <p className="text-xs leading-relaxed text-navy/60">{p(t.emergency.dispatchNote)}</p>

        {(problem || dispatch.error) && (
          <p role="alert" className="text-sm font-semibold text-red-700">
            {problem ?? dispatch.error?.message}
          </p>
        )}

        <div className="mt-auto grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center justify-center rounded-xl border border-navy/15 text-sm font-semibold text-navy hover:bg-navy/5">
            {p(t.emergency.cancel)}
          </button>
          <button
            type="submit"
            disabled={dispatch.isPending}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-navy text-sm font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {dispatch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {p(t.emergency.sendNow)}
          </button>
        </div>
      </div>
    </form>
  );
}
