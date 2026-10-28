// Emergencies → send a professional now: service, problem, place, who goes, the price.

import { useState, type FormEvent } from "react";
import { Clock, Loader2, PhoneIncoming, Send, Siren, X } from "lucide-react";
import LocationPicker, { type Pin } from "@/components/map/LocationPicker";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { timeAgo } from "@/lib/time";
import { directionsLinks } from "@contracts/geo";
import { isValidPhone } from "@contracts/phone";
import { CATEGORY_MAP } from "@contracts/services";
import { QUOTE_AMOUNT_PATTERN, todayHere } from "@contracts/workflow";
import { DISTRICT_INFO, worksIn } from "@contracts/districts";
import { useAuth } from "@/hooks/useAuth";
import { useMyServices } from "@/hooks/useMyServices";
import { Field, INPUT, Part, type Prefill } from "./emergencyParts";

/** Now, as the visit's time of day. */
function slotNow(hour = new Date().getHours()) {
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

export function EmergencyJobForm({
  prefill,
  onClear,
  onSent,
}: {
  prefill: Prefill | null;
  onClear: () => void;
  onSent: (job: { id: number; technician: string }) => void;
}) {
  const { t, p, lang } = useI18n();
  const utils = trpc.useUtils();
  const technicians = trpc.tech.list.useQuery();
  // A specialist sends only for their own services; admins for any.
  const { categories: myCategories } = useMyServices();
  const [category, setCategory] = useState(prefill?.category ?? "");
  const [problem, setProblem] = useState(prefill?.problem ?? "");
  const [name, setName] = useState("");
  // The number the customer sent with the emergency (theirs, typed by them).
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [pin, setPin] = useState<Pin | null>(prefill?.pin ?? null);
  const [address, setAddress] = useState(prefill?.address ?? "");
  const [technicianId, setTechnicianId] = useState("");
  const [amount, setAmount] = useState("");
  const [missing, setMissing] = useState<string | null>(null);

  const create = trpc.emergency.create.useMutation({
    onSuccess: ({ requestId }) => {
      const tech = technicians.data?.find((x) => x.id === Number(technicianId));
      onSent({ id: requestId, technician: tech?.name ?? tech?.email ?? "" });
      void utils.specialist.queue.invalidate();
      void utils.emergency.waiting.invalidate();
      void utils.tech.list.invalidate();
    },
  });

  // The pin's district: technicians only work in theirs (an admin can still make an exception).
  const { user } = useAuth();
  const place = trpc.emergency.districtOf.useQuery(pin ?? { lat: 0, lng: 0 }, { enabled: !!pin, staleTime: Infinity });
  const district = pin ? (place.data?.district ?? null) : null;
  const outsideOf = (x: { districts: string[] }) => !worksIn(x.districts, district);
  // In their districts first, then the chosen trade, then the least busy.
  const sorted = [...(technicians.data ?? [])].sort(
    (a, b) =>
      Number(outsideOf(a)) - Number(outsideOf(b)) ||
      Number(b.trade === category) - Number(a.trade === category) ||
      a.activeJobs - b.activeJobs,
  );
  const matching = category ? sorted.filter((x) => x.trade === category) : [];
  const others = sorted.filter((x) => !matching.includes(x));
  const techLabel = (x: (typeof sorted)[number]) =>
    [
      x.name ?? x.email,
      x.trade && CATEGORY_MAP[x.trade] ? p(CATEGORY_MAP[x.trade].name) : null,
      x.districts.length ? x.districts.map((d) => p(DISTRICT_INFO[d].name)).join(", ") : x.area,
      p(t.emergency.activeJobs).replace("{n}", String(x.activeJobs)),
      outsideOf(x) ? p(t.districts.outside) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  const locked = (x: (typeof sorted)[number]) => outsideOf(x) && user?.role !== "admin";

  function submit(event: FormEvent) {
    event.preventDefault();
    const problemText = !category
      ? t.emergency.needService
      : problem.trim().length < 2
        ? t.emergency.needProblem
        : !pin
          ? t.emergency.needPin
          : !technicianId
            ? t.emergency.needTechnician
            : name.trim() && name.trim().length < 2
              ? t.emergency.needName
              : phone.trim() && !isValidPhone(phone)
                ? t.misc.phoneInvalid
                : amount.trim() && !QUOTE_AMOUNT_PATTERN.test(amount.trim())
                  ? t.emergency.needPrice
                  : null;
    setMissing(problemText ? p(problemText) : null);
    if (problemText || !pin) return;
    create.mutate({
      emergencyId: prefill?.emergencyId,
      category,
      problem: problem.trim(),
      name: name.trim() || undefined,
      phone: phone.trim() || undefined,
      address: address.trim() || undefined,
      lat: pin.lat,
      lng: pin.lng,
      technicianId: Number(technicianId),
      amount: amount.trim() || undefined,
      visitDate: todayHere(),
      timeSlot: slotNow(),
    });
  }

  const links = pin ? directionsLinks(pin.lat, pin.lng) : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-navy/15 bg-white shadow-[0_1px_2px_rgb(12_43_92/0.06)]">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-navy/10 px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-flame/10 text-flame">
          <PhoneIncoming className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-extrabold text-navy">{p(t.emergency.formTitle)}</h2>
          <p className="mt-0.5 text-sm text-navy/60">{p(t.emergency.formHint)}</p>
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 rounded-md bg-navy/[0.06] px-2 py-1 text-xs font-semibold text-navy/70 sm:inline-flex">
          <Clock className="h-3.5 w-3.5" />
          {p(t.emergency.nowChip)}
        </span>
      </div>

      {prefill && (
        <div className="flex items-center gap-2 border-b border-flame/20 bg-flame/[0.06] px-5 py-2.5 text-sm text-navy">
          <Siren className="h-4 w-4 shrink-0 text-flame" />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold">{p(t.emergency.fromDispatch)}</span> · {prefill.label} · {timeAgo(prefill.createdAt, lang)}
          </span>
          <button type="button" onClick={onClear} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-navy/70 hover:bg-navy/5">
            <X className="h-3.5 w-3.5" />
            {p(t.emergency.clearForm)}
          </button>
        </div>
      )}

      <form onSubmit={submit}>
        <div className="grid gap-8 p-5 lg:grid-cols-2">
          <div className="flex flex-col gap-8">
            <Part n={1} title={p(t.emergency.partCustomer)} aside={<span className="text-xs text-navy/50">{p(t.emergency.optionalNow)}</span>}>
              <div className="grid grid-cols-2 gap-3">
                <Field label={p(t.emergency.fieldName)}>
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} autoComplete="off" className={INPUT} />
                </Field>
                <Field label={p(t.emergency.fieldPhone)}>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" dir="ltr" maxLength={32} autoComplete="off" className={INPUT} />
                </Field>
              </div>
            </Part>
            <Part n={2} title={p(t.emergency.partProblem)}>
              <Field label={p(t.emergency.serviceLabel)}>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={INPUT}>
                  <option value="">{p(t.emergency.chooseService)}</option>
                  {myCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {p(c.name)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={p(t.emergency.problemLabel)}>
                <textarea
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder={p(t.emergency.problemPh)}
                  className={`${INPUT} h-auto resize-none py-2`}
                />
              </Field>
            </Part>
          </div>

          <Part
            n={3}
            title={p(t.emergency.partLocation)}
            aside={
              links && (
                <span className="flex gap-3 text-xs font-semibold text-flame-ink">
                  <a href={links.google} target="_blank" rel="noreferrer" className="hover:underline">
                    Google Maps
                  </a>
                  <a href={links.waze} target="_blank" rel="noreferrer" className="hover:underline">
                    Waze
                  </a>
                </span>
              )
            }
          >
            <LocationPicker value={pin} onChange={setPin} staff />
            <Field label={p(t.book.address)}>
              <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={1000} placeholder={p(t.book.addressPh)} className={INPUT} />
            </Field>
          </Part>
        </div>

        {/* Dispatch bar */}
        <div className="border-t border-navy/10 bg-paper/70 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
            <Field label={p(t.emergency.technicianLabel)}>
              <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} className={INPUT} disabled={technicians.isLoading}>
                <option value="">{technicians.isLoading ? "…" : sorted.length ? p(t.emergency.chooseTechnician) : p(t.emergency.noTechnicians)}</option>
                {matching.length > 0 && (
                  <optgroup label={p(CATEGORY_MAP[category].name)}>
                    {matching.map((x) => (
                      <option key={x.id} value={x.id} disabled={locked(x)}>
                        {techLabel(x)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {others.length > 0 && (
                  <optgroup label={p(matching.length ? t.emergency.otherTechnicians : t.emergency.allTechnicians)}>
                    {others.map((x) => (
                      <option key={x.id} value={x.id} disabled={locked(x)}>
                        {techLabel(x)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </Field>
            <Field label={p(t.emergency.priceLabel)}>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 start-3 mt-1.5 flex items-center text-sm text-navy/45">$</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" dir="ltr" placeholder="45" className={`${INPUT} ps-7`} />
              </div>
            </Field>
            <button
              type="submit"
              disabled={create.isPending}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-flame px-5 text-sm font-semibold text-white transition-colors hover:bg-flame-ink disabled:opacity-50"
            >
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {p(t.emergency.sendTech)}
            </button>
          </div>
          {missing || create.error ? (
            <p role="alert" className="mt-2 text-sm font-medium text-red-700">
              {missing ?? create.error?.message}
            </p>
          ) : (
            <p className="mt-2 text-xs text-navy/55">{p(t.emergency.dispatchNote)}</p>
          )}
        </div>
      </form>
    </section>
  );
}
