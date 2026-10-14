import { useState } from "react";
import { Loader2, Mail, MessageCircle, Phone } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/router";
import { ServiceIcon } from "@/components/ServiceIcon";
import { Stars } from "@/components/Stars";
import { MediaGrid } from "@/components/MediaGrid";
import { BeforeAfter } from "@/components/JobPhotos";
import { AnswerList } from "@/components/AnswerList";
import JobMap from "@/components/map/JobMap";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { telLink, whatsappLink } from "@/lib/contact";
import { CATEGORY_MAP, type RequestStatus } from "@contracts/services";
import {
  ASSIGNABLE_STATUSES,
  QUOTE_AMOUNT_PATTERN,
  VISIT_FEE_REASONS,
  type VisitFeeReason,
} from "@contracts/workflow";
import { cancelPending } from "./queueMeta";

type Outputs = inferRouterOutputs<AppRouter>;
type Technician = Outputs["tech"]["list"][number];

const LABEL = "font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/70";
const INPUT =
  "min-h-11 w-full rounded-2xl border-2 border-navy/30 bg-white px-4 text-sm font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none";
const SMALL_BTN = "btn-pill-outline !min-h-10 !px-4 !py-1.5 text-xs";

export function RequestDetail({
  id,
  technicians,
  onGoToApplications,
}: {
  id: number;
  technicians: Technician[];
  onGoToApplications?: () => void;
}) {
  const { t, p, lang } = useI18n();
  const utils = trpc.useUtils();
  const detail = trpc.specialist.detail.useQuery({ id });
  const invalidate = () => {
    void utils.specialist.queue.invalidate();
    void utils.specialist.detail.invalidate({ id });
    void utils.tech.list.invalidate();
  };

  const d = detail.data;
  if (!d) {
    return (
      <div className="card-br flex min-h-60 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-navy" />
      </div>
    );
  }

  const r = d.request;
  const status = r.status as RequestStatus;
  const cat = CATEGORY_MAP[r.category];
  const tech = d.technician;
  const dateTime = (v: Date | string) =>
    new Date(v).toLocaleString(lang === "ar" ? "ar" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

  return (
    // key on the request: switching requests resets every form below
    <div key={r.id} className="card-br p-5 sm:p-6 animate-rise-in">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-navy/15 bg-paper text-bird">
          <ServiceIcon id={r.category} className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-black text-navy">
            #{r.id} · {cat ? p(cat.name) : r.category}
          </h2>
          <p className="text-xs text-navy/70">
            {p(t.dash4.created)} {dateTime(r.createdAt)}
          </p>
          {d.guarantee && (
            <p className="mt-1 text-xs font-bold text-bird">
              {p(t.requests.guaranteeFor).replace("{id}", String(d.guarantee.originalId))}
              {d.guarantee.technicianName &&
                ` · ${p(t.dash4.originalTech).replace("{name}", d.guarantee.technicianName)}`}
            </p>
          )}
        </div>
        {r.emergency && (
          <span className="rounded-full bg-flame px-3 py-1 text-xs font-bold text-white">{p(t.emergency.badge)}</span>
        )}
        <span className="rounded-full border-2 border-navy/25 px-3 py-1 text-xs font-bold text-navy">
          {p(t.status[status])}
        </span>
      </div>

      <NextStep
        // a new status or cancellation request resets the forms
        key={`${r.id}-${status}-${r.cancelRequestedAt ?? ""}`}
        request={r}
        technicians={technicians}
        onDone={invalidate}
        onGoToApplications={onGoToApplications}
      />

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {/* left: customer, place, problem */}
        <div className="flex flex-col gap-5">
          <section className="rounded-2xl border-2 border-navy/15 bg-paper p-4 text-sm">
            <p className={LABEL}>{p(t.dash.customer)}</p>
            <p className="mt-2 font-bold text-navy">{d.customer?.name ?? r.contactName ?? "-"}</p>
            {d.customer?.email && <p className="text-navy/70">{d.customer.email}</p>}
            <p className="mt-1 text-navy/70" dir="ltr">
              {r.phone}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={telLink(r.phone)} className={SMALL_BTN}>
                <Phone className="h-4 w-4" /> {p(t.dash3.call)}
              </a>
              <a href={whatsappLink(r.phone)} target="_blank" rel="noreferrer" className={SMALL_BTN}>
                <MessageCircle className="h-4 w-4" /> {p(t.dash3.whatsapp)}
              </a>
              {d.customer?.email && (
                <a href={`mailto:${d.customer.email}`} className={SMALL_BTN}>
                  <Mail className="h-4 w-4" /> {p(t.dash3.emailAction)}
                </a>
              )}
            </div>
            <p className={`${LABEL} mt-4`}>{p(t.dash4.visit)}</p>
            <p className="mt-1 text-navy/80">
              {r.area} · {r.address}
            </p>
            <p className="mt-1 text-navy/80">
              {r.preferredDate} ·{" "}
              {p({ morning: t.book.slotMorning, afternoon: t.book.slotAfternoon, evening: t.book.slotEvening }[r.timeSlot as "morning"] ?? { en: r.timeSlot, ar: r.timeSlot })}
            </p>
          </section>

          {r.lat != null && r.lng != null ? (
            <JobMap
              key={r.id}
              home={{ lat: r.lat, lng: r.lng }}
              technician={d.location ? { lat: Number(d.location.lat), lng: Number(d.location.lng) } : null}
              technicianLabel="T"
            />
          ) : (
            <p className="text-xs text-navy/70">{p(t.map.noPin)}</p>
          )}

          <section className="text-sm">
            <p className={LABEL}>{p(t.dash.answers)}</p>
            <AnswerList category={r.category} answersJson={r.answers} className="mt-2 flex flex-col gap-1.5" />
            {r.notes && <p className="mt-3 rounded-xl bg-navy/5 p-3 text-navy/80">{r.notes}</p>}
          </section>

          {d.media.some((m) => m.kind === "customer") && (
            <section>
              <p className={LABEL}>{p(t.dash.media)}</p>
              <MediaGrid items={d.media.filter((m) => m.kind === "customer")} className="mt-2 grid grid-cols-3 gap-2" />
            </section>
          )}
          <section className="empty:hidden">
            <BeforeAfter media={d.media} />
          </section>
        </div>

        {/* right: technician, preparation, timeline */}
        <div className="flex flex-col gap-5">
          <section className="rounded-2xl border-2 border-navy/15 bg-paper p-4">
            <p className={LABEL}>{p(t.dash2.currentTech)}</p>
            {tech ? (
              <div className="mt-2 flex items-center gap-3">
                <Avatar name={tech.name} photoUrl={tech.photoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-navy">{tech.name ?? tech.email}</p>
                  {!tech.stillTechnician && <p className="text-xs text-navy/70">{p(t.dash4.formerTechnician)}</p>}
                  {tech.phone && (
                    <p className="text-xs text-navy/70" dir="ltr">
                      {tech.phone}
                    </p>
                  )}
                </div>
                {tech.phone && (
                  <a href={whatsappLink(tech.phone)} target="_blank" rel="noreferrer" className={SMALL_BTN}>
                    <MessageCircle className="h-4 w-4" /> {p(t.dash3.whatsapp)}
                  </a>
                )}
              </div>
            ) : (
              <p className="mt-1 text-sm font-bold text-navy">{p(t.dash2.none)}</p>
            )}
            {r.quoteAmount && (
              <p className="mt-3 text-xs text-navy/70">
                {p(t.dash4.quote)}:{" "}
                <span className="font-bold text-navy">
                  {r.guaranteeFor && r.quoteAmount === "0" ? p(t.requests.free) : `$${r.quoteAmount}`}
                </span>
                {r.quoteNote ? ` · ${r.quoteNote}` : ""}
              </p>
            )}
          </section>

          {d.review && (
            <section className="rounded-2xl border-2 border-flame/40 bg-flame/5 p-4">
              <p className={LABEL}>{p(t.dash4.customerRating)}</p>
              <p className="mt-2 flex items-center gap-2 text-sm font-bold text-navy">
                <Stars value={d.review.rating} size={16} />
                {d.review.rating}/5
              </p>
              {d.review.comment && <p className="mt-2 text-sm text-navy/80">“{d.review.comment}”</p>}
            </section>
          )}

          <Preparation key={r.id} request={r} onSaved={invalidate} />

          <section>
            <p className={LABEL}>{p(t.dash4.timeline)}</p>
            <ol className="mt-3 border-s-2 border-navy/15 ps-4">
              {d.events.map((e) => (
                <li key={e.id} className="relative pb-3">
                  <span className="absolute -start-[23px] top-1 h-3 w-3 rounded-full border-2 border-paper bg-navy" />
                  <p className="text-sm font-bold text-navy">
                    {p(
                      (t.events as Record<string, { en: string; ar: string }>)[e.status] ??
                        t.status[e.status as RequestStatus] ?? { en: e.status, ar: e.status },
                    )}
                  </p>
                  {e.note && <p className="text-xs text-navy/80">{e.note}</p>}
                  <p className="text-xs text-navy/60" dir="ltr">
                    {dateTime(e.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

export function Avatar({ name, photoUrl, size = "h-10 w-10" }: { name: string | null; photoUrl: string | null; size?: string }) {
  const initials = (name ?? "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return photoUrl ? (
    <img src={photoUrl} alt="" className={`${size} shrink-0 rounded-full border-2 border-bird object-cover`} />
  ) : (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full border-2 border-bird bg-bird/10 text-xs font-black text-bird`}>
      {initials}
    </span>
  );
}

type RequestRow = Outputs["specialist"]["detail"]["request"];

/**
 * No repair happened at the visit (no work, nobody there, or cancelled once the technician
 * set off): the specialist closes the job charging only the visit fee fixed at booking.
 */
function VisitFeeClose({ request: r, onDone }: { request: RequestRow; onDone: () => void }) {
  const { t, p } = useI18n();
  const [reason, setReason] = useState<VisitFeeReason | null>(null);
  const [note, setNote] = useState("");
  const close = trpc.specialist.closeWithVisitFee.useMutation({ onSuccess: onDone });
  if (!r.visitFee) return <p className="mt-4 text-xs text-navy/60">{p(t.visitFee.staffNone)}</p>;
  const fee = `$${r.visitFee}`;

  return (
    <div className="mt-4 rounded-2xl border-2 border-navy/15 bg-white p-3">
      <p className="text-sm font-bold text-navy">{p(t.visitFee.staffTitle)}</p>
      <p className="mt-0.5 text-xs text-navy/70">{p(t.visitFee.staffHint).replace("{fee}", fee)}</p>
      <div role="radiogroup" aria-label={p(t.visitFee.staffTitle)} className="mt-3 grid auto-rows-fr grid-cols-3 gap-2">
        {VISIT_FEE_REASONS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={reason === value}
            onClick={() => setReason(value)}
            className={`min-h-10 rounded-xl border-2 px-2 text-xs font-bold leading-tight ${
              reason === value ? "border-navy bg-navy text-paper" : "border-navy/30 bg-white text-navy"
            }`}
          >
            {p(t.visitFee.reasons[value])}
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={p(t.visitFee.notePh)}
        aria-label={p(t.visitFee.notePh)}
        className={`${INPUT} mt-2 w-full`}
      />
      <button
        onClick={() => {
          const label = p(t.visitFee.staffConfirm).replace("{fee}", fee);
          if (reason && window.confirm(`${label}: #${r.id}?`)) {
            close.mutate({ id: r.id, reason, note: note.trim() || undefined });
          }
        }}
        disabled={!reason || close.isPending}
        className="btn-pill-outline mt-2 !min-h-10 w-full justify-center !py-1.5 text-sm disabled:opacity-40"
      >
        {close.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {p(t.visitFee.staffConfirm).replace("{fee}", fee)}
      </button>
      {close.error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-destructive">
          {close.error.message}
        </p>
      )}
    </div>
  );
}

/** The one action this request needs now, depending on its status. */
function NextStep({
  request: r,
  technicians,
  onDone,
  onGoToApplications,
}: {
  request: RequestRow;
  technicians: Technician[];
  onDone: () => void;
  onGoToApplications?: () => void;
}) {
  const { t, p } = useI18n();
  const status = r.status as RequestStatus;
  const [amount, setAmount] = useState("");
  const [quoteNote, setQuoteNote] = useState("");
  const [note, setNote] = useState("");
  const [chosenTech, setChosenTech] = useState(r.technicianId ? String(r.technicianId) : "");
  const [changingQuote, setChangingQuote] = useState(false);
  const askedToCancel = cancelPending(r);
  // A customer's cancellation request opens the cancel form, ready to confirm.
  const [closing, setClosing] = useState(askedToCancel);
  const [closeReason, setCloseReason] = useState(
    askedToCancel ? `${p(t.events.cancel_requested)}${r.cancelReason ? `: ${r.cancelReason}` : ""}` : "",
  );

  const startReview = trpc.specialist.startReview.useMutation({ onSuccess: onDone });
  const sendQuote = trpc.specialist.sendQuote.useMutation({
    onSuccess: () => {
      setChangingQuote(false);
      onDone();
    },
  });
  const setStatus = trpc.specialist.setStatus.useMutation({ onSuccess: onDone });
  const assign = trpc.tech.assign.useMutation({ onSuccess: onDone });
  const cancel = trpc.specialist.cancel.useMutation({ onSuccess: onDone });
  const acceptGuarantee = trpc.specialist.acceptGuarantee.useMutation({ onSuccess: onDone });
  const error = [startReview, sendQuote, setStatus, assign, cancel, acceptGuarantee].find((m) => m.isError)?.error?.message;
  const busy =
    startReview.isPending ||
    sendQuote.isPending ||
    setStatus.isPending ||
    assign.isPending ||
    cancel.isPending ||
    acceptGuarantee.isPending;
  const guaranteeReview = status === "in_review" && !!r.guaranteeFor;
  const spinner = busy && <Loader2 className="h-4 w-4 animate-spin" />;

  const message = {
    submitted: t.dash4.stepReview,
    in_review: t.dash4.stepQuote,
    quote_ready: { en: t.dash4.stepWaitQuote.en.replace("{amount}", r.quoteAmount ?? ""), ar: t.dash4.stepWaitQuote.ar.replace("{amount}", r.quoteAmount ?? "") },
    approved: t.dash4.stepAssign,
    scheduled: t.dash4.stepScheduled,
    in_progress: t.dash4.stepInProgress,
    completed: t.dash4.stepClosed,
    cancelled: t.dash4.stepClosed,
  }[status];
  const closed = status === "completed" || status === "cancelled";

  return (
    <section className={`mt-5 rounded-2xl border-2 p-4 ${closed ? "border-navy/15 bg-paper" : "border-flame bg-flame/5"}`}>
      <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-flame-ink">{p(t.dash4.nextStep)}</p>
      <p className="mt-1 text-sm font-semibold text-navy">
        {guaranteeReview ? p(t.dash4.stepGuarantee).replace("{id}", String(r.guaranteeFor)) : p(message)}
      </p>
      {status === "cancelled" && r.visitFeeReason && (
        <p className="mt-1 text-sm font-bold text-navy">
          {p(t.app.visitFeeClosed)
            .replace("{fee}", `$${r.visitFee}`)
            .replace("{reason}", p(t.visitFee.reasons[r.visitFeeReason]))}
        </p>
      )}

      {askedToCancel && (
        <div role="alert" className="mt-3 rounded-xl border-2 border-red-700 bg-red-700/5 p-3 text-sm text-navy">
          <p className="font-bold">{p(t.dash4.cancelAskedNote)}</p>
          {r.cancelReason && <p className="mt-1">{p(t.dash4.cancelAskedReason).replace("{reason}", r.cancelReason)}</p>}
        </div>
      )}

      {status === "submitted" && (
        <button onClick={() => startReview.mutate({ id: r.id })} disabled={busy} className="btn-pill-primary mt-3 self-start">
          {spinner}
          {p(t.dash.review)}
        </button>
      )}

      {status === "quote_ready" && !changingQuote && (
        <button
          onClick={() => {
            setAmount(r.quoteAmount ?? "");
            setQuoteNote(r.quoteNote ?? "");
            setChangingQuote(true);
          }}
          className="mt-3 text-sm font-bold text-navy underline underline-offset-4"
        >
          {p(t.dash4.changeQuote)}
        </button>
      )}

      {guaranteeReview && (
        <>
          <button
            onClick={() => acceptGuarantee.mutate({ id: r.id })}
            disabled={busy}
            className="btn-pill-primary mt-3 disabled:opacity-40"
          >
            {acceptGuarantee.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {p(t.dash4.acceptGuarantee)}
          </button>
          <p className="mt-4 text-xs font-bold text-navy/70">{p(t.dash4.notCovered)}</p>
        </>
      )}

      {(status === "in_review" || changingQuote) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr_auto]">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={`${p(t.dash.quoteAmount)}`} className={INPUT} aria-label={p(t.dash.quoteAmount)} />
          <input value={quoteNote} onChange={(e) => setQuoteNote(e.target.value)} placeholder={p(t.dash.quoteNote)} className={INPUT} aria-label={p(t.dash.quoteNote)} />
          <button
            onClick={() => sendQuote.mutate({ id: r.id, amount: amount.trim(), note: quoteNote || undefined })}
            disabled={busy || !QUOTE_AMOUNT_PATTERN.test(amount.trim())}
            className="btn-pill-primary !min-h-11 disabled:opacity-40"
          >
            {spinner}
            {status === "quote_ready" ? p(t.dash4.updateQuote) : p(t.dash.sendQuote)}
          </button>
        </div>
      )}

      {ASSIGNABLE_STATUSES.includes(status) && status !== "in_progress" && (
        <div className="mt-3">
          {technicians.length === 0 ? (
            <p className="text-xs text-navy/70">
              {p(t.dash2.noTechToAssign)}{" "}
              {onGoToApplications && (
                <button type="button" onClick={onGoToApplications} className="font-bold text-navy underline underline-offset-4">
                  {p(t.dash4.goToApplications)}
                </button>
              )}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <select
                value={chosenTech}
                onChange={(e) => setChosenTech(e.target.value)}
                aria-label={p(t.dash2.assignTech)}
                className="min-h-11 rounded-2xl border-2 border-navy/30 bg-white px-4 text-sm font-semibold text-navy focus:border-flame focus:outline-none"
              >
                <option value="">{p(t.dash2.chooseTech)}</option>
                {technicians.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name ?? x.email}
                    {x.trade && CATEGORY_MAP[x.trade] ? ` · ${p(CATEGORY_MAP[x.trade].name)}` : ""} · {x.activeJobs}
                  </option>
                ))}
              </select>
              <button
                onClick={() => assign.mutate({ requestId: r.id, technicianId: Number(chosenTech) })}
                disabled={busy || !chosenTech || Number(chosenTech) === r.technicianId}
                className="btn-pill-outline !min-h-11 !py-2 disabled:opacity-40"
              >
                {p(t.dash2.assignTech)}
              </button>
            </div>
          )}
        </div>
      )}

      {(status === "approved" || status === "scheduled" || status === "in_progress") && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={p(t.dash.note)} aria-label={p(t.dash.note)} className={`${INPUT} flex-1`} />
          <button
            onClick={() =>
              setStatus.mutate({
                id: r.id,
                status: status === "approved" ? "scheduled" : status === "scheduled" ? "in_progress" : "completed",
                note: note || undefined,
              })
            }
            disabled={busy || (status === "approved" && !r.technicianId)}
            className="btn-pill-primary !min-h-11 disabled:opacity-40"
          >
            {spinner}
            {status === "approved" ? p(t.dash.schedule) : status === "scheduled" ? p(t.dash.startWork) : p(t.dash.complete)}
          </button>
        </div>
      )}
      {status === "approved" && !r.technicianId && <p className="mt-2 text-xs text-navy/70">{p(t.dash2.needTechToSchedule)}</p>}

      {(status === "scheduled" || status === "in_progress") && !r.guaranteeFor && (
        <VisitFeeClose request={r} onDone={onDone} />
      )}

      {!closed &&
        (closing ? (
          <div className="mt-4 flex flex-col gap-2 border-t-2 border-navy/10 pt-3">
            <textarea
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              placeholder={p(t.dash4.closeReasonPh)}
              aria-label={p(t.dash4.closeReasonPh)}
              rows={2}
              className="w-full rounded-2xl border-2 border-navy/30 bg-white px-4 py-2 text-sm font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none"
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  if (window.confirm(p(t.dash4.closeAsk).replace("{id}", String(r.id)))) {
                    cancel.mutate({ id: r.id, reason: closeReason.trim() });
                  }
                }}
                disabled={busy || closeReason.trim().length < 3}
                className="btn-pill-outline !min-h-10 !border-red-700 !py-1.5 text-sm !text-red-700 disabled:opacity-40"
              >
                {cancel.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {p(t.dash4.closeConfirm)}
              </button>
              <button onClick={() => setClosing(false)} className="text-sm font-bold text-navy underline underline-offset-4">
                {p(t.dash4.closeKeep)}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setClosing(true)}
            className="mt-4 block text-xs font-bold text-navy/70 underline underline-offset-4 hover:text-red-700"
          >
            {p(t.dash4.closeOpen)}
          </button>
        ))}

      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

/** Specialist's preparation notes, shown on the technician's job card. */
function Preparation({ request: r, onSaved }: { request: RequestRow; onSaved: () => void }) {
  const { t, p, lang } = useI18n();
  const [form, setForm] = useState({
    diagnosis: r.prepDiagnosis ?? "",
    tools: r.prepTools ?? "",
    parts: r.prepParts ?? "",
    instructions: r.prepInstructions ?? "",
  });
  const save = trpc.specialist.prepare.useMutation({ onSuccess: onSaved });
  const closed = r.status === "completed" || r.status === "cancelled";
  const fields = [
    { key: "diagnosis", label: t.dash4.prepDiagnosis, ph: t.dash4.prepDiagnosisPh, rows: 2 },
    { key: "tools", label: t.dash4.prepTools, ph: t.dash4.prepToolsPh, rows: 2 },
    { key: "parts", label: t.dash4.prepParts, ph: t.dash4.prepPartsPh, rows: 2 },
    { key: "instructions", label: t.dash4.prepInstructions, ph: t.dash4.prepInstructionsPh, rows: 3 },
  ] as const;

  return (
    <section className="rounded-2xl border-2 border-dashed border-bird/50 bg-bird/5 p-4">
      <p className={LABEL}>{p(t.dash4.prepTitle)}</p>
      <p className="mt-1 text-xs text-navy/70">{p(t.dash4.prepHint)}</p>
      <div className="mt-3 flex flex-col gap-3">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col text-xs font-bold text-navy">
            {p(f.label)}
            <textarea
              value={form[f.key]}
              onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={p(f.ph)}
              rows={f.rows}
              disabled={closed}
              className="mt-1 w-full rounded-2xl border-2 border-navy/30 bg-white px-3 py-2 text-sm font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none disabled:opacity-60"
            />
          </label>
        ))}
      </div>
      {!closed && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={() => save.mutate({ id: r.id, ...form })} disabled={save.isPending} className="btn-pill-primary !min-h-10 !py-1.5 text-sm">
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {p(t.dash4.prepSave)}
          </button>
          {r.preparedAt && (
            <span className="text-xs text-navy/70">
              {p(t.dash4.prepSaved).replace(
                "{time}",
                new Date(r.preparedAt).toLocaleString(lang === "ar" ? "ar" : "en-GB", { dateStyle: "short", timeStyle: "short" }),
              )}
            </span>
          )}
        </div>
      )}
      {save.error && <p className="mt-2 text-xs font-semibold text-destructive">{save.error.message}</p>}
    </section>
  );
}
