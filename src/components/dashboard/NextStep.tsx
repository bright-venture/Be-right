// The request's next step (dashboard): review, price, assign, schedule, close, visit fee.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { useConfirm } from "@/hooks/useConfirm";
import { trpc } from "@/providers/trpc";
import { CATEGORY_MAP, forWorker, type RequestStatus } from "@contracts/services";
import {
  ASSIGNABLE_STATUSES,
  QUOTE_AMOUNT_PATTERN,
  VISIT_FEE_REASONS,
  type VisitFeeReason,
} from "@contracts/workflow";
import { cancelPending } from "./queueMeta";
import { worksIn } from "@contracts/districts";
import { useAuth } from "@/hooks/useAuth";
import { INPUT, type RequestRow, type Technician } from "./requestDetailParts";

/**
 * No repair happened at the visit (no work, nobody there, or cancelled once the technician
 * set off): the specialist closes the job charging only the visit fee fixed at booking.
 */
function VisitFeeClose({ request: r, onDone }: { request: RequestRow; onDone: () => void }) {
  const { t, p } = useI18n();
  const [confirm, confirmDialog] = useConfirm();
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
      {confirmDialog}
      <button
        onClick={async () => {
          const label = p(t.visitFee.staffConfirm).replace("{fee}", fee);
          if (reason && (await confirm({ title: `${label}: #${r.id}?`, confirmLabel: label }))) {
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
export function NextStep({
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
  const { user } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const status = r.status as RequestStatus;
  // Technicians only work in their districts; an admin can still make an exception.
  const outsideOf = (x: Technician) => !worksIn(x.districts, r.district);
  const [amount, setAmount] = useState("");
  const [quoteNote, setQuoteNote] = useState("");
  const [note, setNote] = useState("");
  const [chosenTech, setChosenTech] = useState(String(r.technicianId ?? ""));
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
    approved: forWorker(t.dash4.stepAssign, r.category),
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
        <div className="mt-3 grid gap-2 sm:grid-cols-[200px_1fr_auto]">
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
                {[...technicians]
                  .sort((a, b) => Number(outsideOf(a)) - Number(outsideOf(b)))
                  .map((x) => (
                    <option key={x.id} value={x.id} disabled={outsideOf(x) && user?.role !== "admin"}>
                      {x.name ?? x.email}
                      {x.trade && CATEGORY_MAP[x.trade] ? ` · ${p(CATEGORY_MAP[x.trade].name)}` : ""} · {x.activeJobs}
                      {outsideOf(x) ? ` · ${p(t.districts.outside)}` : ""}
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
              {confirmDialog}
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: p(t.dash4.closeAsk).replace("{id}", String(r.id)),
                    confirmLabel: p(t.dash4.closeConfirm),
                    tone: "danger",
                  });
                  if (ok) cancel.mutate({ id: r.id, reason: closeReason.trim() });
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
