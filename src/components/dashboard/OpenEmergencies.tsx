// Emergencies waiting for the call, and emergency jobs under way.

import { useState, type FormEvent } from "react";
import { Loader2, MapPin, Phone, Send, Siren } from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import { useConfirm } from "@/hooks/useConfirm";
import { trpc } from "@/providers/trpc";
import { telLink } from "@/lib/contact";
import { timeAgo } from "@/lib/time";
import { isValidPhone } from "@contracts/phone";
import { CATEGORY_MAP, type RequestStatus } from "@contracts/services";
import { QUOTE_AMOUNT_PATTERN } from "@contracts/workflow";
import { useLiveQueue } from "./useLiveQueue";
import { answerLines, EMERGENCY_PROBLEM_MAP } from "@contracts/emergency";
import { CLOSED, EMERGENCY_REFRESH_MS, Field, INPUT, LABEL, type Prefill, SECTION_TITLE } from "./emergencyParts";

/**
 * Open emergencies: those sent by customers and waiting for the call (Open fills in the form,
 * Dismiss takes one off the list), then the emergency jobs under way, from the live queue.
 */
export function OpenEmergencies({ onOpen }: { onOpen: (prefill: Prefill) => void }) {
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
            const answered = answerLines(e.problem, e.answers).sort((a, b) => Number(b.alert) - Number(a.alert));
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
                      {answered.length > 0 && (
                        <ul className="mt-2 flex flex-col gap-0.5 text-xs" aria-label={p(t.emergency.answersTitle)}>
                          {answered.map((a) => (
                            <li key={a.id} className={a.alert ? "font-bold text-red-700" : "text-navy/75"}>
                              {a.alert && "⚠ "}
                              {p(a.question)} <span className="font-bold">{p(a.answer)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
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
                          // The answers go into the job's notes for the technician.
                          problem: [label, ...answered.map((a) => `${p(a.question)} ${p(a.answer)}`)].join("\n"),
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
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" dir="ltr" maxLength={32} className={INPUT} />
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
