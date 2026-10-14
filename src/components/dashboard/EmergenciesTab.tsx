import { useState, type FormEvent, type ReactNode } from "react";
import { CircleCheck, Loader2, Phone, Send } from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import LocationPicker, { type Pin } from "@/components/map/LocationPicker";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { telLink } from "@/lib/contact";
import { timeAgo } from "@/lib/time";
import { directionsLinks } from "@contracts/geo";
import { isValidPhone } from "@contracts/phone";
import { CATEGORIES, CATEGORY_MAP, type RequestStatus } from "@contracts/services";
import { QUOTE_AMOUNT_PATTERN, todayHere } from "@contracts/workflow";
import { useLiveQueue } from "./useLiveQueue";

const INPUT =
  "mt-1.5 min-h-11 w-full rounded-xl border border-navy/20 bg-white px-3 text-sm font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none";
const LABEL = "text-[11px] font-bold uppercase tracking-[0.1em] text-navy/55";
const SECTION_TITLE = "font-display text-sm font-extrabold uppercase tracking-[0.12em] text-navy/60";
const CLOSED: readonly RequestStatus[] = ["completed", "cancelled"];

/** Now, as the visit's time of day. */
function slotNow(hour = new Date().getHours()) {
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={LABEL}>{label}</span>
      {children}
    </label>
  );
}

/**
 * Emergency calls: a customer phoned the emergency line. While on the phone, the specialist
 * fills this in and sends a technician at once; the job lands in the technician's app,
 * scheduled for now and marked Emergency. Below: the emergency jobs still open.
 */
export function EmergenciesTab() {
  return (
    <div className="mt-8 flex flex-col gap-8">
      <EmergencyJobForm />
      <OpenEmergencies />
    </div>
  );
}

function EmergencyJobForm() {
  const { t, p } = useI18n();
  const utils = trpc.useUtils();
  const technicians = trpc.tech.list.useQuery();
  const [category, setCategory] = useState("");
  const [problem, setProblem] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState<Pin | null>(null);
  const [address, setAddress] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [amount, setAmount] = useState("");
  const [missing, setMissing] = useState<string | null>(null);
  const [sent, setSent] = useState<{ id: number; technician: string } | null>(null);
  // The map remounts empty after a job is sent.
  const [formKey, setFormKey] = useState(0);

  const create = trpc.emergency.create.useMutation({
    onSuccess: ({ requestId }) => {
      const tech = technicians.data?.find((x) => x.id === Number(technicianId));
      setSent({ id: requestId, technician: tech?.name ?? tech?.email ?? "" });
      setCategory("");
      setProblem("");
      setName("");
      setPhone("");
      setPin(null);
      setAddress("");
      setTechnicianId("");
      setAmount("");
      setFormKey((k) => k + 1);
      void utils.specialist.queue.invalidate();
      void utils.tech.list.invalidate();
    },
  });

  // Technicians of the chosen trade first, then the least busy.
  const sorted = [...(technicians.data ?? [])].sort(
    (a, b) => Number(b.trade === category) - Number(a.trade === category) || a.activeJobs - b.activeJobs,
  );
  const matching = category ? sorted.filter((x) => x.trade === category) : [];
  const others = sorted.filter((x) => !matching.includes(x));
  const techLabel = (x: (typeof sorted)[number]) =>
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
    const problemText = !category
      ? t.emergency.needService
      : problem.trim().length < 2
        ? t.emergency.needProblem
        : name.trim().length < 2
          ? t.emergency.needName
          : !isValidPhone(phone)
            ? t.misc.phoneInvalid
            : !pin
              ? t.emergency.needPin
              : !address.trim()
                ? t.emergency.needAddress
                : !technicianId
                  ? t.emergency.needTechnician
                  : !QUOTE_AMOUNT_PATTERN.test(amount.trim())
                    ? t.emergency.needPrice
                    : null;
    setMissing(problemText ? p(problemText) : null);
    if (problemText || !pin) return;
    setSent(null);
    create.mutate({
      category,
      problem: problem.trim(),
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      lat: pin.lat,
      lng: pin.lng,
      technicianId: Number(technicianId),
      amount: amount.trim(),
      visitDate: todayHere(),
      timeSlot: slotNow(),
    });
  }

  const links = pin ? directionsLinks(pin.lat, pin.lng) : null;

  return (
    <section>
      <h2 className={SECTION_TITLE}>{p(t.emergency.formTitle)}</h2>
      <p className="mt-1 text-sm text-navy/60">{p(t.emergency.formHint)}</p>

      {sent && (
        <p role="status" className="mt-3 flex items-center gap-2 rounded-2xl border border-green-700/25 bg-green-700/[0.06] p-3 text-sm font-semibold text-navy">
          <CircleCheck className="h-5 w-5 shrink-0 text-green-700" />
          {p(t.emergency.sentTo).replace("{name}", sent.technician).replace("{id}", String(sent.id))}
        </p>
      )}

      <form
        key={formKey}
        onSubmit={submit}
        className="mt-3 grid gap-5 rounded-2xl border border-navy/15 bg-white p-4 shadow-[0_1px_2px_rgb(12_43_92/0.06)] sm:p-5 lg:grid-cols-2"
      >
        {/* What and who */}
        <div className="flex flex-col gap-4">
          <Field label={p(t.emergency.serviceLabel)}>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={INPUT}>
              <option value="">{p(t.emergency.chooseService)}</option>
              {CATEGORIES.map((c) => (
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
              className={`${INPUT} py-2.5`}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={p(t.emergency.contactName)}>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} className={INPUT} />
            </Field>
            <Field label={p(t.emergency.contactPhone)}>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" dir="ltr" maxLength={32} placeholder={p(t.book.phonePh)} className={INPUT} />
            </Field>
          </div>
        </div>

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
          <Field label={p(t.book.address)}>
            <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={1000} placeholder={p(t.book.addressPh)} className={INPUT} />
          </Field>
        </div>

        {/* Who goes, for how much */}
        <div className="grid gap-4 border-t border-navy/10 pt-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:col-span-2">
          <Field label={p(t.emergency.technicianLabel)}>
            <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} className={INPUT} disabled={technicians.isLoading}>
              <option value="">{technicians.isLoading ? "…" : sorted.length ? p(t.emergency.chooseTechnician) : p(t.emergency.noTechnicians)}</option>
              {matching.length > 0 && (
                <optgroup label={p(CATEGORY_MAP[category].name)}>
                  {matching.map((x) => (
                    <option key={x.id} value={x.id}>
                      {techLabel(x)}
                    </option>
                  ))}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label={p(matching.length ? t.emergency.otherTechnicians : t.emergency.allTechnicians)}>
                  {others.map((x) => (
                    <option key={x.id} value={x.id}>
                      {techLabel(x)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>
          <Field label={p(t.emergency.priceLabel)}>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" dir="ltr" placeholder="45" className={INPUT} />
          </Field>
        </div>

        <div className="flex flex-col gap-3 lg:col-span-2 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-xs leading-relaxed text-navy/60">{p(t.emergency.dispatchNote)}</p>
          <button
            type="submit"
            disabled={create.isPending}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-flame px-6 text-sm font-semibold text-white hover:bg-flame-ink disabled:opacity-50"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {p(t.emergency.sendTech)}
          </button>
        </div>

        {(missing || create.error) && (
          <p role="alert" className="text-sm font-semibold text-red-700 lg:col-span-2">
            {missing ?? create.error?.message}
          </p>
        )}
      </form>
    </section>
  );
}

/** Emergency jobs still open, from the live queue: who called, where, who went. */
function OpenEmergencies() {
  const { t, p, lang } = useI18n();
  const queue = useLiveQueue();
  const technicians = trpc.tech.list.useQuery();
  const open = (queue.data ?? []).filter((x) => x.request.emergency && !CLOSED.includes(x.request.status as RequestStatus));
  const techName = (id: number | null) => {
    const x = technicians.data?.find((tech) => tech.id === id);
    return x?.name ?? x?.email ?? "-";
  };

  return (
    <section>
      <h2 className={`${SECTION_TITLE} flex items-center gap-2`}>
        {p(t.emergency.openJobs)}
        <span className="rounded-md bg-flame px-1.5 py-px text-[11px] tracking-normal text-white">{open.length}</span>
      </h2>
      {open.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-navy/20 bg-white p-6 text-center text-sm text-navy/60">{p(t.emergency.noOpenJobs)}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {open.map(({ request: r }) => (
            <li key={r.id} className="relative overflow-hidden rounded-2xl border border-navy/15 bg-white shadow-[0_1px_2px_rgb(12_43_92/0.06)]">
              <span aria-hidden className="absolute inset-y-0 start-0 w-1 bg-flame" />
              <div className="grid gap-3 p-4 ps-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-6">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-flame/10 text-flame">
                    <ServiceIcon id={r.category} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-[15px] font-extrabold text-navy">
                      #{r.id} · {CATEGORY_MAP[r.category] ? p(CATEGORY_MAP[r.category].name) : r.category}
                    </p>
                    <p className="line-clamp-1 text-xs text-navy/70">{r.notes}</p>
                    <p className="text-xs text-navy/55">
                      {r.address} · {timeAgo(r.createdAt, lang)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="min-w-0">
                    <p className={LABEL}>{p(t.emergency.contactName)}</p>
                    <p className="truncate font-semibold text-navy">{r.contactName ?? "-"}</p>
                  </div>
                  <div className="min-w-0">
                    <p className={LABEL}>{p(t.emergency.technicianLabel)}</p>
                    <p className="truncate font-semibold text-navy">{techName(r.technicianId)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 lg:justify-end">
                  <span className="rounded-md bg-navy/[0.06] px-2 py-1 text-xs font-bold text-navy/70">{p(t.status[r.status as RequestStatus])}</span>
                  <a href={telLink(r.phone)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-navy/15 px-3 text-sm font-semibold text-navy hover:bg-navy/5">
                    <Phone className="h-4 w-4" />
                    <span dir="ltr">{r.phone}</span>
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
