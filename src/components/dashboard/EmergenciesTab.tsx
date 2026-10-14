import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { CircleCheck, Clock, Loader2, MapPin, Phone, PhoneIncoming, Send, Siren, X } from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import LocationPicker, { type Pin } from "@/components/map/LocationPicker";
import { useI18n } from "@/i18n";
import { useConfirm } from "@/hooks/useConfirm";
import { trpc } from "@/providers/trpc";
import { telLink } from "@/lib/contact";
import { timeAgo } from "@/lib/time";
import { directionsLinks } from "@contracts/geo";
import { isValidPhone } from "@contracts/phone";
import { CATEGORIES, CATEGORY_MAP, type RequestStatus } from "@contracts/services";
import { QUOTE_AMOUNT_PATTERN, todayHere } from "@contracts/workflow";
import { useLiveQueue } from "./useLiveQueue";
import { EMERGENCY_PROBLEM_MAP } from "@contracts/emergency";

/** How often the list checks for newly sent emergencies (the customer is calling). */
export const EMERGENCY_REFRESH_MS = 15_000;

/** What a sent emergency fills in for the specialist; the rest (name, phone...) is taken on the phone. */
type Prefill = {
  emergencyId: number;
  label: string;
  createdAt: Date;
  category: string;
  problem: string;
  pin: Pin;
  phone: string;
  address: string;
};

const INPUT =
  "mt-1.5 h-10 w-full rounded-lg border border-navy/15 bg-white px-3 text-sm text-navy placeholder:text-navy/35 transition-colors focus:border-navy/40 focus:outline-none focus:ring-2 focus:ring-flame/20";
const LABEL = "text-xs font-medium text-navy/65";
const SECTION_TITLE = "font-display text-base font-extrabold text-navy";
const CLOSED: readonly RequestStatus[] = ["completed", "cancelled"];

/** Now, as the visit's time of day. */
function slotNow(hour = new Date().getHours()) {
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

/** A numbered part of the form: 1 Customer, 2 Problem, 3 Location. */
function Part({ n, title, aside, children }: { n: number; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy text-[11px] font-bold text-white">{n}</span>
        <h3 className="text-sm font-semibold text-navy">{title}</h3>
        {aside && <div className="ms-auto">{aside}</div>}
      </div>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </div>
  );
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
 * Emergencies. A customer sent a priority dispatch (what's wrong and where) and is calling,
 * or simply called the emergency line. While on the phone, the specialist fills in the rest
 * (opening a sent emergency fills in what the customer gave) and sends a technician; the job
 * lands in the technician's app, scheduled for now and marked Emergency. Below: emergencies
 * waiting for the call, and the emergency jobs still open.
 */
export function EmergenciesTab() {
  const { t, p } = useI18n();
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  // Each new form (blank, or from a sent emergency) starts fresh.
  const [formKey, setFormKey] = useState(0);
  const [sent, setSent] = useState<{ id: number; technician: string } | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const open = (next: Prefill) => {
    setPrefill(next);
    setSent(null);
    setFormKey((k) => k + 1);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const reset = () => {
    setPrefill(null);
    setFormKey((k) => k + 1);
  };

  return (
    <div ref={top} className="mt-8 flex scroll-mt-24 flex-col gap-10">
      <div className="flex flex-col gap-3">
        {sent && (
          <p role="status" className="flex items-center gap-2 rounded-xl border border-green-700/20 bg-green-700/[0.06] px-4 py-3 text-sm font-medium text-navy">
            <CircleCheck className="h-4 w-4 shrink-0 text-green-700" />
            {p(t.emergency.sentTo).replace("{name}", sent.technician).replace("{id}", String(sent.id))}
          </p>
        )}
        <EmergencyJobForm
          key={formKey}
          prefill={prefill}
          onClear={reset}
          onSent={(job) => {
            setSent(job);
            reset();
          }}
        />
      </div>
      <OpenEmergencies onOpen={open} />
    </div>
  );
}

function EmergencyJobForm({
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
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" dir="ltr" maxLength={32} autoComplete="off" placeholder={p(t.book.phonePh)} className={INPUT} />
                </Field>
              </div>
            </Part>
            <Part n={2} title={p(t.emergency.partProblem)}>
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

/**
 * Open emergencies: those sent by customers and waiting for the call (Open fills in the form,
 * Dismiss takes one off the list), then the emergency jobs under way, from the live queue.
 */
function OpenEmergencies({ onOpen }: { onOpen: (prefill: Prefill) => void }) {
  const { t, p, lang } = useI18n();
  const [confirm, confirmDialog] = useConfirm();
  const utils = trpc.useUtils();
  const queue = useLiveQueue();
  const technicians = trpc.tech.list.useQuery();
  const waiting = trpc.emergency.waiting.useQuery(undefined, { refetchInterval: EMERGENCY_REFRESH_MS });
  const dismiss = trpc.emergency.dismiss.useMutation({ onSettled: () => utils.emergency.waiting.invalidate() });
  const sentList = waiting.data ?? [];
  const open = (queue.data ?? []).filter((x) => x.request.emergency && !CLOSED.includes(x.request.status as RequestStatus));
  const techName = (id: number | null) => {
    const x = technicians.data?.find((tech) => tech.id === id);
    return x?.name ?? x?.email ?? "-";
  };

  return (
    <section>
      {confirmDialog}
      <h2 className={`${SECTION_TITLE} flex items-center gap-2`}>
        {p(t.emergency.openJobs)}
        <span className="rounded-md bg-flame px-1.5 py-px text-[11px] tracking-normal text-white">{sentList.length + open.length}</span>
      </h2>
      {sentList.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3">
          {sentList.map((e) => {
            const info = EMERGENCY_PROBLEM_MAP[e.problem];
            const label = info ? p(info.label) : e.problem;
            return (
              <li key={`sent-${e.id}`} className="relative overflow-hidden rounded-2xl border border-flame/40 bg-flame/[0.03] shadow-[0_1px_2px_rgb(12_43_92/0.06)]">
                <span aria-hidden className="absolute inset-y-0 start-0 w-1 bg-flame" />
                <div className="grid gap-3 p-4 ps-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-6">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-flame text-white">
                      <Siren className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-display text-[15px] font-extrabold text-navy">
                        {label}
                        <span className="rounded-md bg-flame/10 px-1.5 py-0.5 text-[11px] font-bold text-flame-ink">{p(t.emergency.waitingCall)}</span>
                      </p>
                      {e.phone && (
                        <a href={telLink(e.phone)} className="flex items-center gap-1 text-xs font-semibold text-navy hover:underline">
                          <Phone className="h-3.5 w-3.5 shrink-0 text-flame" />
                          <span dir="ltr">{e.phone}</span>
                        </a>
                      )}
                      <p className="flex items-start gap-1 text-xs text-navy/70">
                        <MapPin className="mt-px h-3.5 w-3.5 shrink-0 text-flame" />
                        <span className="line-clamp-1">{e.address || p(t.emergency.pinOnly)}</span>
                      </p>
                      <p className="text-xs text-navy/55">{timeAgo(e.createdAt, lang)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 lg:justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        onOpen({
                          emergencyId: e.id,
                          label,
                          createdAt: e.createdAt,
                          category: info?.category ?? "",
                          problem: label,
                          pin: { lat: e.lat, lng: e.lng },
                          phone: e.phone ?? "",
                          address: e.address ?? "",
                        })
                      }
                      className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-flame px-4 text-sm font-semibold text-white hover:bg-flame-ink"
                    >
                      <Send className="h-4 w-4" />
                      {p(t.emergency.openInForm)}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await confirm({
                          title: p(t.emergency.dismissAsk),
                          message: p(t.emergency.dismissNote).replace("{problem}", label),
                          confirmLabel: p(t.emergency.dismiss),
                          tone: "danger",
                        });
                        if (ok) dismiss.mutate({ id: e.id });
                      }}
                      disabled={dismiss.isPending}
                      className="inline-flex h-10 items-center rounded-lg border border-navy/15 px-3 text-sm font-semibold text-navy hover:bg-navy/5 disabled:opacity-50"
                    >
                      {p(t.emergency.dismiss)}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {sentList.length === 0 && open.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-navy/20 bg-white p-6 text-center text-sm text-navy/60">{p(t.emergency.noOpenJobs)}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {open.map(({ request: r }) => (
            <EmergencyJobRow key={r.id} job={r} technician={techName(r.technicianId)} />
          ))}
        </ul>
      )}
    </section>
  );
}

type Job = NonNullable<ReturnType<typeof useLiveQueue>["data"]>[number]["request"];

/**
 * An emergency job under way. The technician may have gone before the call: what's still
 * missing (name, phone, price) shows here, and Add details fills it in. The technician is
 * emailed when the customer's number arrives.
 */
function EmergencyJobRow({ job: r, technician }: { job: Job; technician: string }) {
  const { t, p, lang } = useI18n();
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(r.contactName ?? "");
  const [phone, setPhone] = useState(r.phone);
  const [amount, setAmount] = useState(r.quoteAmount ?? "");
  const [address, setAddress] = useState(r.address === "-" ? "" : r.address);
  const [problem, setProblem] = useState<string | null>(null);
  const update = trpc.emergency.updateJob.useMutation({
    onSuccess: () => {
      setEditing(false);
      void utils.specialist.queue.invalidate();
    },
  });
  const missing = [
    !r.contactName && p(t.emergency.fieldName),
    !r.phone && p(t.emergency.fieldPhone),
    !r.quoteAmount && p(t.emergency.priceShort),
  ].filter(Boolean);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const bad =
      name.trim() && name.trim().length < 2
        ? t.emergency.needName
        : phone.trim() && !isValidPhone(phone)
          ? t.misc.phoneInvalid
          : amount.trim() && !QUOTE_AMOUNT_PATTERN.test(amount.trim())
            ? t.emergency.needPrice
            : null;
    setProblem(bad ? p(bad) : null);
    if (bad) return;
    update.mutate({
      requestId: r.id,
      name: name.trim() && name.trim() !== (r.contactName ?? "") ? name.trim() : undefined,
      phone: phone.trim() && phone.trim() !== r.phone ? phone.trim() : undefined,
      amount: amount.trim() && amount.trim() !== (r.quoteAmount ?? "") ? amount.trim() : undefined,
      address: address.trim() && address.trim() !== r.address ? address.trim() : undefined,
    });
  };

  return (
    <li className="relative overflow-hidden rounded-2xl border border-navy/15 bg-white shadow-[0_1px_2px_rgb(12_43_92/0.06)]">
      <span aria-hidden className="absolute inset-y-0 start-0 w-1 bg-flame" />
      <div className="grid gap-3 p-4 ps-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-flame/10 text-flame">
            <ServiceIcon id={r.category} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-display text-[15px] font-extrabold text-navy">
              #{r.id} · {CATEGORY_MAP[r.category] ? p(CATEGORY_MAP[r.category].name) : r.category}
              {missing.length > 0 && (
                <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">
                  {p(t.emergency.missing).replace("{fields}", missing.join(", "))}
                </span>
              )}
            </p>
            <p className="line-clamp-1 text-xs text-navy/70">{r.notes}</p>
            <p className="text-xs text-navy/55">
              {r.address} · {timeAgo(r.createdAt, lang)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="min-w-0">
            <p className={LABEL}>{p(t.emergency.fieldName)}</p>
            <p className="truncate font-semibold text-navy">{r.contactName ?? "-"}</p>
          </div>
          <div className="min-w-0">
            <p className={LABEL}>{p(t.emergency.technicianLabel)}</p>
            <p className="truncate font-semibold text-navy">{technician}</p>
          </div>
          <div className="min-w-0">
            <p className={LABEL}>{p(t.emergency.priceShort)}</p>
            <p className="truncate font-semibold text-navy">{r.quoteAmount ? `$${r.quoteAmount}` : "-"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <span className="rounded-md bg-navy/[0.06] px-2 py-1 text-xs font-bold text-navy/70">{p(t.status[r.status as RequestStatus])}</span>
          {r.phone && (
            <a href={telLink(r.phone)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-navy/15 px-3 text-sm font-semibold text-navy hover:bg-navy/5">
              <Phone className="h-4 w-4" />
              <span dir="ltr">{r.phone}</span>
            </a>
          )}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
            className={`inline-flex h-10 items-center rounded-lg px-3 text-sm font-semibold ${
              missing.length ? "bg-flame text-white hover:bg-flame-ink" : "border border-navy/15 text-navy hover:bg-navy/5"
            }`}
          >
            {p(missing.length ? t.emergency.addDetails : t.emergency.editDetails)}
          </button>
        </div>
      </div>

      {editing && (
        <form onSubmit={save} className="grid gap-3 border-t border-navy/10 bg-paper/70 p-4 ps-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_8rem_1.4fr_auto] lg:items-end">
          <Field label={p(t.emergency.fieldName)}>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} className={INPUT} />
          </Field>
          <Field label={p(t.emergency.fieldPhone)}>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" dir="ltr" maxLength={32} placeholder={p(t.book.phonePh)} className={INPUT} />
          </Field>
          <Field label={p(t.emergency.priceLabel)}>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" dir="ltr" placeholder="45" className={INPUT} />
          </Field>
          <Field label={p(t.book.address)}>
            <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={1000} placeholder={p(t.book.addressPh)} className={INPUT} />
          </Field>
          <button
            type="submit"
            disabled={update.isPending}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-navy px-4 text-sm font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {p(t.emergency.save)}
          </button>
          {(problem || update.error) && (
            <p role="alert" className="text-sm font-medium text-red-700 sm:col-span-2 lg:col-span-5">
              {problem ?? update.error?.message}
            </p>
          )}
        </form>
      )}
    </li>
  );
}
