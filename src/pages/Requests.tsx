import { useState } from "react";
import { Link } from "react-router";
import { ChevronDown, Loader2, MessageCircle, Repeat } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ServiceIcon } from "@/components/ServiceIcon";
import { MediaGrid } from "@/components/MediaGrid";
import { BeforeAfter } from "@/components/JobPhotos";
import { AnswerList } from "@/components/AnswerList";
import { ReportProblem } from "@/components/ReportProblem";
import { RateJob } from "@/components/RateJob";
import { StatusBadge, TechnicianCard } from "@/components/requests/RequestParts";
import { COMPANY } from "@contracts/legal";
import { useI18n } from "@/i18n";
import { useConfirm } from "@/hooks/useConfirm";
import { formatDay, formatVisitDay } from "@/lib/time";
import { useRoleGate } from "@/hooks/useRoleGate";
import { trpc } from "@/providers/trpc";
import {
  CATEGORY_MAP,
  STATUS_ORDER,
  type RequestStatus,
} from "@contracts/services";
import { CANCEL_REQUESTABLE_STATUSES, canTransition } from "@contracts/workflow";


export default function Requests() {
  const { t, p, lang } = useI18n();
  const [confirm, confirmDialog] = useConfirm();
  const { role, isLoading: authLoading } = useRoleGate(["customer"], { requireSignIn: true });
  const isAuthenticated = role === "customer";
  // ?open=12 (from the app home screen) opens that request straight away.
  const [openId, setOpenId] = useState<number | null>(() => Number(new URLSearchParams(window.location.search).get("open")) || null);
  const [askingCancel, setAskingCancel] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const utils = trpc.useUtils();

  const list = trpc.requests.mine.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const detail = trpc.requests.get.useQuery(
    { id: openId! },
    {
      enabled: openId !== null,
      // Keep the technician's live location fresh while a job is active.
      refetchInterval: (query) =>
        ["scheduled", "in_progress"].includes(query.state.data?.request.status ?? "") ? 15_000 : false,
    },
  );
  const approve = trpc.requests.approveQuote.useMutation({
    onSuccess: () => {
      utils.requests.mine.invalidate();
      utils.requests.get.invalidate();
    },
    // e.g. the price changed: show the new one next to the message
    onError: () => utils.requests.get.invalidate(),
  });
  const cancel = trpc.requests.cancel.useMutation({
    onSuccess: () => {
      utils.requests.mine.invalidate();
      utils.requests.get.invalidate();
    },
  });
  /** "Are you sure?" before each way a customer cancels. */
  const confirmCancel = (id: number) =>
    confirm({
      title: p(t.requests.cancelAskTitle).replace("{id}", String(id)),
      message: p(t.requests.cancelAskNote),
      confirmLabel: p(t.requests.cancel),
      cancelLabel: p(t.requests.keepRequest),
      tone: "danger",
    });
  const confirmDecline = (id: number) =>
    confirm({
      title: p(t.requests.declineAskTitle),
      message: p(t.requests.declineAskNote).replace("{id}", String(id)),
      confirmLabel: p(t.requests.declineQuote),
      cancelLabel: p(t.requests.goBack),
      tone: "danger",
    });
  const confirmAskCancel = () =>
    confirm({
      title: p(t.requests.askCancelTitle),
      message: p(t.requests.askCancelNote),
      confirmLabel: p(t.requests.askCancelSend),
      cancelLabel: p(t.requests.keepVisit),
    });
  const requestCancel = trpc.requests.requestCancel.useMutation({
    onSuccess: () => {
      setAskingCancel(null);
      setCancelReason("");
      utils.requests.get.invalidate();
    },
  });

  if (authLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Loader2 className="h-8 w-8 animate-spin text-navy" />
      </div>
    );
  }

  const rows = list.data ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-20 pt-24 sm:px-6">
        {confirmDialog}
        <div className="flex items-end justify-between gap-4">
          <h1 className="font-display text-3xl font-black text-navy sm:text-4xl">
            {p(t.requests.title)}
          </h1>
          <Link to="/book" className="btn-pill-primary !px-5 !py-2">
            {p(t.nav.book)}
          </Link>
        </div>

        {rows.length === 0 && !list.isLoading && (
          <div className="card-br mt-10 p-10 text-center">
            <img src="/assets/mascot-320.webp" width={320} height={408} alt="" className="mx-auto h-auto w-28" />
            <p className="mt-4 font-semibold text-navy/70">{p(t.requests.empty)}</p>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-4">
          {rows.map((r) => {
            const cat = CATEGORY_MAP[r.category];
            const open = openId === r.id;
            return (
              <div key={r.id} className="card-br overflow-hidden">
                <button
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="flex min-h-16 w-full items-center gap-4 p-4 text-start sm:p-5"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-navy/15 bg-paper text-bird">
                    <ServiceIcon id={r.category} className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-base font-extrabold text-navy">
                      {cat ? p(cat.name) : r.category}{" "}
                      <span className="text-xs font-bold text-navy/70">#{r.id}</span>
                      {r.guaranteeFor && (
                        <span className="ms-2 rounded-full bg-bird px-2 py-0.5 align-middle text-[10px] font-bold text-white">
                          {p(t.requests.guaranteeBadge)}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-navy/70">
                      {p(t.requests.requestedOn)}: {formatDay(r.createdAt, lang)} · {p(t.requests.preferred)}:{" "}
                      {formatVisitDay(r.preferredDate, lang)} · {r.area}
                    </span>
                  </span>
                  <StatusBadge status={r.status as RequestStatus} />
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-navy transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>

                {/* Opens at once: the details fill in when they arrive (a second click closes it). */}
                {open && !(detail.data && detail.data.request.id === r.id) && (
                  <div className="flex flex-col items-center gap-3 border-t-2 border-navy/10 p-6">
                    {detail.isError ? (
                      <>
                        <p role="alert" className="text-sm font-semibold text-destructive">
                          {p(t.misc.error)}
                        </p>
                        <button type="button" onClick={() => void detail.refetch()} className="btn-pill-outline !min-h-10 !py-1.5 text-sm">
                          {p(t.admin.retry)}
                        </button>
                      </>
                    ) : (
                      <Loader2 className="h-6 w-6 animate-spin text-navy" aria-label={p(t.misc.loading)} />
                    )}
                  </div>
                )}
                {open && detail.data && detail.data.request.id === r.id && (
                  <div className="border-t-2 border-navy/10 p-5 animate-rise-in">
                    {detail.data.request.guaranteeFor && (
                      <p className="mb-4 text-sm font-semibold text-navy">
                        {p(t.requests.guaranteeFor).replace("{id}", String(detail.data.request.guaranteeFor))}
                      </p>
                    )}
                    {detail.data.request.visitFeeReason && (
                      <p className="mb-4 rounded-xl bg-navy/5 p-3 text-sm font-semibold text-navy">
                        {p(t.app.visitFeeClosed)
                          .replace("{fee}", `$${detail.data.request.visitFee}`)
                          .replace("{reason}", p(t.visitFee.reasons[detail.data.request.visitFeeReason]))}
                      </p>
                    )}
                    {/* timeline */}
                    <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/70">
                      {p(t.requests.timeline)}
                    </p>
                    <ol className="mt-3 flex flex-wrap items-center gap-1">
                      {STATUS_ORDER.map((s, i) => {
                        const reached =
                          STATUS_ORDER.indexOf(
                            detail.data!.request.status as RequestStatus,
                          ) >= i &&
                          detail.data!.request.status !== "cancelled";
                        return (
                          <li key={s} className="flex items-center gap-1">
                            <span
                              className={`rounded-full border-2 px-3 py-1 text-[11px] font-bold ${
                                reached
                                  ? "border-navy bg-navy text-paper"
                                  : "border-navy/20 text-navy/70"
                              }`}
                            >
                              {p(t.status[s])}
                            </span>
                            {i < STATUS_ORDER.length - 1 && (
                              <span className="h-0.5 w-3 bg-navy/20" />
                            )}
                          </li>
                        );
                      })}
                    </ol>

                    {/* quote */}
                    <div className="mt-5">
                      <div className="rounded-2xl border-2 border-navy/15 bg-paper p-4">
                        <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/70">
                          {p(detail.data.request.visitFeeReason ? t.book.visitFeeTitle : t.requests.quote)}
                        </p>
                        {/* closed with the visit fee: that is what the customer pays, not the quote */}
                        {detail.data.request.visitFeeReason ? (
                          <p className="mt-2 font-display text-lg font-extrabold text-navy">${detail.data.request.visitFee}</p>
                        ) : detail.data.request.quoteAmount ? (
                          <>
                            <p className="mt-2 font-display text-lg font-extrabold text-navy">
                              {detail.data.request.guaranteeFor && detail.data.request.quoteAmount === "0"
                                ? p(t.requests.free)
                                : `$${detail.data.request.quoteAmount}`}
                            </p>
                            {detail.data.request.quoteNote && (
                              <p className="mt-1 text-xs text-navy/70">
                                {detail.data.request.quoteNote}
                              </p>
                            )}
                            {detail.data.request.visitFee && !detail.data.request.guaranteeFor && (
                              <p className="mt-1 text-xs text-navy/70">
                                {p(t.app.quoteIncludesFee).replace("{fee}", `$${detail.data.request.visitFee}`)}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="mt-2 text-sm text-navy/70">-</p>
                        )}
                      </div>
                    </div>

                    {detail.data.request.status === "quote_ready" && (
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          // the price shown here: the server refuses if it changed meanwhile
                          onClick={() => approve.mutate({ id: r.id, amount: detail.data!.request.quoteAmount ?? "" })}
                          disabled={approve.isPending}
                          className="btn-pill-primary"
                        >
                          {approve.isPending && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                          {p(t.requests.approveQuote)}
                        </button>
                        <button
                          onClick={async () => {
                            if (await confirmDecline(r.id)) cancel.mutate({ id: r.id });
                          }}
                          disabled={cancel.isPending}
                          className="btn-pill-outline"
                        >
                          {p(t.requests.declineQuote)}
                        </button>
                      </div>
                    )}

                    {/* technician + live location */}
                    {detail.data.technician && (
                      <TechnicianCard
                        name={detail.data.technician.name}
                        photoUrl={detail.data.technician.photoUrl}
                        rating={detail.data.technician.rating}
                        home={
                          detail.data.request.lat != null && detail.data.request.lng != null
                            ? { lat: detail.data.request.lat, lng: detail.data.request.lng }
                            : null
                        }
                        location={detail.data.location}
                        arrived={detail.data.arrived}
                      />
                    )}

                    {/* answers */}
                    <p className="mt-6 font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/70">
                      {p(t.requests.answers)}
                    </p>
                    <AnswerList
                      category={r.category}
                      answersJson={detail.data.request.answers}
                      className="mt-3 flex flex-col gap-1.5 text-sm"
                    />

                    {/* the customer's own photos, then the technician's before/after photos */}
                    {detail.data.media.some((m) => m.kind === "customer") && (
                      <>
                        <p className="mt-6 font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/70">
                          {p(t.requests.photos)}
                        </p>
                        <div className="mt-3">
                          <MediaGrid items={detail.data.media.filter((m) => m.kind === "customer")} />
                        </div>
                      </>
                    )}
                    <div className="mt-6 empty:hidden">
                      <BeforeAfter media={detail.data.media} forCustomer />
                    </div>

                    {detail.data.request.status !== "quote_ready" &&
                      canTransition("cancel", detail.data.request.status as RequestStatus) && (
                      <button
                        onClick={async () => {
                          if (await confirmCancel(r.id)) cancel.mutate({ id: r.id });
                        }}
                        disabled={cancel.isPending}
                        className="mt-6 text-sm font-bold text-destructive underline underline-offset-4"
                      >
                        {p(t.requests.cancel)}
                      </button>
                    )}
                    {detail.data.request.status === "completed" && (
                      <div className="mt-6 flex flex-col gap-4 border-t border-navy/10 pt-5 [&>*]:!mt-0">
                        <RateJob key={`rate-${r.id}`} requestId={r.id} rated={!!detail.data.review} />
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={`/book?cat=${detail.data.request.category}`} className="btn-pill-outline !min-h-11 !px-5 !py-2 text-sm">
                            <Repeat className="h-4 w-4" aria-hidden />
                            {p(t.rebook)}
                          </Link>
                          {detail.data.guarantee && (
                            <ReportProblem
                              key={r.id}
                              requestId={r.id}
                              guarantee={detail.data.guarantee}
                              onReported={() => {
                                void utils.requests.mine.invalidate();
                                void utils.requests.get.invalidate();
                              }}
                            />
                          )}
                        </div>
                      </div>
                    )}

                    {/* WhatsApp about this job: only once the business number is set (contracts/legal.ts). */}
                    {COMPANY.whatsapp && (
                      <a
                        href={`https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(`Be Right #${r.id}: `)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 ms-3 inline-flex items-center gap-2 rounded-full border-2 border-green-700 bg-green-700/10 px-4 py-2 text-sm font-bold text-green-800 transition-colors hover:bg-green-700 hover:text-white"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden />
                        {p(t.requests.whatsappUs)}
                      </a>
                    )}

                    {/* after scheduling: ask a specialist to cancel */}
                    {CANCEL_REQUESTABLE_STATUSES.includes(detail.data.request.status as RequestStatus) &&
                      (detail.data.request.cancelRequestedAt ? (
                        <p className="mt-6 rounded-xl bg-navy/5 p-3 text-sm font-semibold text-navy">
                          {p(t.requests.cancelAsked).replace(
                            "{date}",
                            new Date(detail.data.request.cancelRequestedAt).toLocaleDateString(lang === "ar" ? "ar" : "en-GB", {
                              day: "numeric",
                              month: "long",
                            }),
                          )}
                        </p>
                      ) : askingCancel === r.id ? (
                        <div className="mt-6 flex flex-col gap-2">
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
                            onClick={async () => {
                              if (await confirmAskCancel()) requestCancel.mutate({ id: r.id, reason: cancelReason.trim() || undefined });
                            }}
                            disabled={requestCancel.isPending}
                            className="btn-pill-outline self-start"
                          >
                            {requestCancel.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                            {p(t.requests.askCancelSend)}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAskingCancel(r.id)}
                          className="mt-6 text-sm font-bold text-destructive underline underline-offset-4"
                        >
                          {p(t.requests.askCancel)}
                        </button>
                      ))}

                    {(cancel.isError || approve.isError || requestCancel.isError) && (
                      <p role="alert" className="mt-3 text-sm font-semibold text-destructive">
                        {(cancel.error ?? approve.error ?? requestCancel.error)?.message}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
      <Footer />
    </div>
  );
}
