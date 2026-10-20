import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CalendarDays, Check, ClipboardList, Loader2, MapPin, MessageCircle, Repeat, XCircle } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ServiceIcon } from "@/components/ServiceIcon";
import { MediaGrid } from "@/components/MediaGrid";
import { BeforeAfter } from "@/components/JobPhotos";
import { AnswerList } from "@/components/AnswerList";
import { ReportProblem } from "@/components/ReportProblem";
import { RateJob } from "@/components/RateJob";
import { StatusBadge, TechnicianCard } from "@/components/requests/RequestParts";
import { useI18n } from "@/i18n";
import { useRoleGate } from "@/hooks/useRoleGate";
import { trpc } from "@/providers/trpc";
import { formatDay, formatMoment, formatVisitDay } from "@/lib/time";
import { COMPANY } from "@contracts/legal";
import {
  CATEGORY_MAP,
  CATEGORY_TINT,
  STATUS_ORDER,
  type RequestStatus,
} from "@contracts/services";
import { ACTIVE_JOB_STATUSES, CANCEL_REQUESTABLE_STATUSES, canTransition } from "@contracts/workflow";

const CARD = "rounded-3xl border border-navy/10 bg-white p-5";
const LABEL = "font-display text-xs font-bold uppercase tracking-[0.16em] text-navy/60";

/**
 * The phone app's screen for one request: what the customer has to do now at the top
 * (approve the quote, follow the technician, rate the job), then progress, then details.
 */
export default function AppRequest() {
  const { t, p, lang } = useI18n();
  const navigate = useNavigate();
  const id = Number(useParams().id);
  const { role, isLoading: authLoading } = useRoleGate(["customer"], { requireSignIn: true });
  const utils = trpc.useUtils();
  const [askingCancel, setAskingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const detail = trpc.requests.get.useQuery(
    { id },
    {
      enabled: role === "customer" && Number.isInteger(id),
      retry: false,
      // Keep the technician's live location fresh while the job is active.
      refetchInterval: (query) =>
        ["scheduled", "in_progress"].includes(query.state.data?.request.status ?? "") ? 15_000 : false,
    },
  );
  const refresh = () => {
    void utils.requests.mine.invalidate();
    void utils.requests.get.invalidate();
  };
  const approve = trpc.requests.approveQuote.useMutation({
    onSuccess: refresh,
    // e.g. the price changed meanwhile: show the new one next to the message
    onError: () => utils.requests.get.invalidate(),
  });
  const cancel = trpc.requests.cancel.useMutation({ onSuccess: refresh });
  const requestCancel = trpc.requests.requestCancel.useMutation({
    onSuccess: () => {
      setAskingCancel(false);
      setCancelReason("");
      void utils.requests.get.invalidate();
    },
  });

  if (authLoading || role !== "customer" || detail.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Loader2 className="h-8 w-8 animate-spin text-navy" />
      </div>
    );
  }

  if (!detail.data) {
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        <Navbar />
        <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-24 text-center">
          <p className="font-semibold text-navy/70">{p(t.app.notFound)}</p>
          <Link to="/requests" className="btn-pill-outline mt-5 !min-h-11 text-sm">
            {p(t.requests.title)}
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  const { request: r, media, events, technician, location, review, guarantee } = detail.data;
  const status = r.status as RequestStatus;
  const cat = CATEGORY_MAP[r.category];
  const tint = CATEGORY_TINT[r.category] ?? { bg: "#ECEFF4", ink: "#0C2B5C" };
  const price = r.guaranteeFor && r.quoteAmount === "0" ? p(t.requests.free) : r.quoteAmount ? `$${r.quoteAmount}` : null;
  const step = STATUS_ORDER.indexOf(status);
  const slot: Record<string, string> = {
    morning: p(t.book.slotMorning),
    afternoon: p(t.book.slotAfternoon),
    evening: p(t.book.slotEvening),
  };
  /** When the request reached a step (latest event for it). */
  const reachedAt = (s: RequestStatus) => events.find((e) => e.status === s)?.createdAt;
  const error = cancel.error ?? approve.error ?? requestCancel.error;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pt-20">
        {/* header */}
        <section className="flex items-center gap-3 pt-2">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: tint.bg, color: tint.ink }}
          >
            <ServiceIcon id={r.category} className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[22px] font-black leading-tight tracking-tight text-navy">
              {cat ? p(cat.name) : r.category}
            </h1>
            <p className="text-xs font-bold text-navy/50">#{r.id}</p>
          </div>
          <StatusBadge status={status} />
        </section>
        {r.guaranteeFor && (
          <p className="rounded-2xl bg-bird/10 px-4 py-3 text-sm font-semibold text-bird">
            {p(t.requests.guaranteeFor).replace("{id}", String(r.guaranteeFor))}
          </p>
        )}

        {/* visit */}
        <section className={`${CARD} flex flex-col gap-3 !py-4`}>
          <div className="flex items-center gap-3">
            <ClipboardList className="h-5 w-5 shrink-0 text-navy/50" />
            <div className="min-w-0">
              <p className="text-xs text-navy/60">{p(t.requests.requestedOn)}</p>
              <p className="text-sm font-bold text-navy">{formatDay(r.createdAt, lang)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-navy/10 pt-3">
            <CalendarDays className="h-5 w-5 shrink-0 text-navy/50" />
            <div className="min-w-0">
              <p className="text-xs text-navy/60">{p(t.app.visit)}</p>
              <p className="text-sm font-bold text-navy">
                {formatVisitDay(r.preferredDate, lang)} · {slot[r.timeSlot] ?? r.timeSlot}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-navy/10 pt-3">
            <MapPin className="h-5 w-5 shrink-0 text-navy/50" />
            <div className="min-w-0">
              <p className="text-xs text-navy/60">{p(t.app.address)}</p>
              <p className="break-words text-sm font-bold text-navy">
                {r.area} · {r.address}
              </p>
            </div>
          </div>
        </section>

        {/* what to do now: approve the quote */}
        {status === "quote_ready" && (
          <section className="rounded-3xl border-2 border-flame bg-white p-5 shadow-[0_10px_24px_rgb(244_83_9/0.15)]">
            <p className={LABEL}>{p(t.app.quoteTitle)}</p>
            <p className="mt-1 font-display text-4xl font-black text-navy tabular-nums">{price ?? "-"}</p>
            {r.quoteNote && <p className="mt-2 text-sm text-navy/80">{r.quoteNote}</p>}
            <p className="mt-2 text-xs text-navy/60">
              {p(t.app.quoteHint)}
              {r.visitFee && !r.guaranteeFor && ` ${p(t.app.quoteIncludesFee).replace("{fee}", `$${r.visitFee}`)}`}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => cancel.mutate({ id: r.id })}
                disabled={cancel.isPending || approve.isPending}
                className="btn-pill-outline !min-h-12 justify-center text-sm"
              >
                {p(t.requests.declineQuote)}
              </button>
              <button
                // the price shown here: the server refuses if it changed meanwhile
                onClick={() => approve.mutate({ id: r.id, amount: r.quoteAmount ?? "" })}
                disabled={approve.isPending || cancel.isPending}
                className="btn-pill-primary !min-h-12 justify-center text-sm"
              >
                {approve.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {p(t.app.approveAmount).replace("{amount}", price ?? "")}
              </button>
            </div>
          </section>
        )}

        {/* follow the technician */}
        {technician && ACTIVE_JOB_STATUSES.includes(status) && (
          <section className="-mt-5">
            <TechnicianCard
              name={technician.name}
              photoUrl={technician.photoUrl}
              rating={technician.rating}
              home={r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null}
              location={location}
            />
          </section>
        )}

        {/* done: rate, report a problem, book again (even spacing: the shared rating and
            guarantee boxes bring their own top margins, removed here) */}
        {status === "completed" && (
          <section className="flex flex-col gap-3 [&>*]:!mt-0">
            <div className={`${CARD} empty:hidden`}>
              <BeforeAfter media={media} forCustomer />
            </div>
            <RateJob key={`rate-${r.id}`} requestId={r.id} rated={!!review} />
            {guarantee && <ReportProblem key={r.id} requestId={r.id} guarantee={guarantee} onReported={refresh} />}
            <Link to={`/book?cat=${r.category}`} className="btn-pill-outline w-full justify-center !min-h-12 text-sm">
              <Repeat className="h-4 w-4" aria-hidden />
              {p(t.rebook)}
            </Link>
          </section>
        )}

        {/* progress */}
        <section className={CARD}>
          <p className={LABEL}>{p(t.app.progress)}</p>
          {status === "cancelled" ? (
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-navy/70">
              <XCircle className="h-5 w-5 shrink-0 text-navy/40" />
              {r.visitFeeReason
                ? p(t.app.visitFeeClosed)
                    .replace("{fee}", `$${r.visitFee}`)
                    .replace("{reason}", p(t.visitFee.reasons[r.visitFeeReason]))
                : p(t.app.cancelledNote)}
            </p>
          ) : (
            <ol className="mt-3">
              {STATUS_ORDER.map((s, i) => {
                const reached = i <= step;
                const current = i === step;
                const at = reached ? reachedAt(s) : undefined;
                return (
                  <li key={s} className="relative flex gap-3 pb-4 last:pb-0">
                    {/* the line down to the next step */}
                    {i < STATUS_ORDER.length - 1 && (
                      <span
                        aria-hidden
                        className={`absolute start-[11px] top-6 h-[calc(100%-1.25rem)] w-0.5 ${i < step ? "bg-flame" : "bg-navy/10"}`}
                      />
                    )}
                    <span
                      className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                        reached ? "bg-flame text-white" : "border-2 border-navy/15 bg-white"
                      } ${current ? "ring-4 ring-flame/20" : ""}`}
                    >
                      {reached && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className={`text-sm ${current ? "font-extrabold text-navy" : reached ? "font-semibold text-navy" : "text-navy/45"}`}>
                        {p(t.status[s])}
                      </p>
                      {at && <p className="text-xs text-navy/50">{formatMoment(at, lang)}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* details */}
        <section className={`${CARD} flex flex-col gap-5`}>
          <div>
            <div className="rounded-2xl bg-paper p-3">
              {/* closed with the visit fee: that is what the customer pays, not the quote */}
              <p className="text-xs text-navy/60">{p(r.visitFeeReason ? t.book.visitFeeTitle : t.requests.quote)}</p>
              <p className="mt-0.5 text-sm font-bold text-navy tabular-nums">
                {r.visitFeeReason ? `$${r.visitFee}` : (price ?? "-")}
              </p>
            </div>
          </div>
          <div>
            <p className={LABEL}>{p(t.requests.answers)}</p>
            <AnswerList category={r.category} answersJson={r.answers} className="mt-2 flex flex-col gap-1.5 text-sm" />
          </div>
          {media.some((m) => m.kind === "customer") && (
            <div>
              <p className={LABEL}>{p(t.requests.photos)}</p>
              <MediaGrid items={media.filter((m) => m.kind === "customer")} className="mt-2 grid grid-cols-3 gap-2" />
            </div>
          )}
          {status !== "completed" && (
            <div className="empty:hidden">
              <BeforeAfter media={media} forCustomer />
            </div>
          )}
        </section>

        {/* WhatsApp about this job: only once the business number is set (contracts/legal.ts). */}
        {COMPANY.whatsapp && (
          <a
            href={`https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(`Be Right #${r.id}: `)}`}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-green-700 bg-green-700/10 text-sm font-bold text-green-800"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            {p(t.requests.whatsappUs)}
          </a>
        )}

        {/* cancelling: directly before scheduling, through a specialist after */}
        {status !== "quote_ready" && canTransition("cancel", status) && (
          <button
            onClick={() => cancel.mutate({ id: r.id }, { onSuccess: () => navigate("/requests") })}
            disabled={cancel.isPending}
            className="min-h-12 rounded-2xl border border-destructive/30 text-sm font-bold text-destructive active:bg-destructive/5"
          >
            {p(t.requests.cancel)}
          </button>
        )}
        {CANCEL_REQUESTABLE_STATUSES.includes(status) &&
          (r.cancelRequestedAt ? (
            <p className="rounded-2xl bg-navy/5 p-4 text-sm font-semibold text-navy">
              {p(t.requests.cancelAsked).replace(
                "{date}",
                new Date(r.cancelRequestedAt).toLocaleDateString(lang === "ar" ? "ar" : "en-GB", {
                  day: "numeric",
                  month: "long",
                }),
              )}
            </p>
          ) : askingCancel ? (
            <div className={`${CARD} flex flex-col gap-3`}>
              <p className="text-sm text-navy/70">{p(t.requests.askCancelHint)}</p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={p(t.requests.askCancelPh)}
                aria-label={p(t.requests.askCancelPh)}
                maxLength={500}
                rows={2}
                className="w-full rounded-2xl border-2 border-navy/30 bg-white px-4 py-2 text-sm font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none"
              />
              <button
                onClick={() => requestCancel.mutate({ id: r.id, reason: cancelReason.trim() || undefined })}
                disabled={requestCancel.isPending}
                className="btn-pill-outline w-full justify-center !min-h-11 text-sm"
              >
                {requestCancel.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {p(t.requests.askCancelSend)}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAskingCancel(true)}
              className="min-h-12 rounded-2xl border border-destructive/30 text-sm font-bold text-destructive active:bg-destructive/5"
            >
              {p(t.requests.askCancel)}
            </button>
          ))}

        {error && (
          <p role="alert" className="text-center text-sm font-semibold text-destructive">
            {error.message}
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
}
