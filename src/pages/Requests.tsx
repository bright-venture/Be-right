import { useState } from "react";
import { Link } from "react-router";
import { ChevronDown, Loader2, MapPin, MessageCircle, Repeat, Star } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ServiceIcon } from "@/components/ServiceIcon";
import { MediaGrid } from "@/components/MediaGrid";
import { BeforeAfter } from "@/components/JobPhotos";
import JobMap from "@/components/map/JobMap";
import { AnswerList } from "@/components/AnswerList";
import { ReportProblem } from "@/components/ReportProblem";
import { RateJob } from "@/components/RateJob";
import { Stars } from "@/components/Stars";
import { COMPANY } from "@contracts/legal";
import { useI18n } from "@/i18n";
import { isRecent } from "@/lib/time";
import { useRoleGate } from "@/hooks/useRoleGate";
import { trpc } from "@/providers/trpc";
import {
  CATEGORY_MAP,
  STATUS_ORDER,
  URGENCY_META,
  type RequestStatus,
  type UrgencyLevel,
} from "@contracts/services";
import { CANCEL_REQUESTABLE_STATUSES, canTransition } from "@contracts/workflow";

const STATUS_STYLE: Record<RequestStatus, string> = {
  submitted: "border-navy/40 bg-white text-navy",
  in_review: "border-bird bg-bird/10 text-bird",
  quote_ready: "border-flame bg-flame text-white",
  approved: "border-navy bg-navy text-paper",
  scheduled: "border-navy bg-navy text-paper",
  in_progress: "border-flame bg-flame/15 text-flame-dark",
  completed: "border-green-700 bg-green-700 text-white",
  cancelled: "border-navy/30 bg-navy/5 text-navy/70",
};

function StatusBadge({ status }: { status: RequestStatus }) {
  const { t, p } = useI18n();
  return (
    <span
      className={`inline-block rounded-full border-2 px-3 py-1 text-xs font-bold ${STATUS_STYLE[status]}`}
    >
      {p(t.status[status])}
    </span>
  );
}

function initials(name: string | null) {
  return (name ?? "BR")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function TechnicianCard({
  name,
  photoUrl,
  rating,
  home,
  location,
}: {
  name: string | null;
  photoUrl: string | null;
  rating: { average: number | null; count: number };
  home: { lat: number; lng: number } | null;
  location: { lat: string; lng: string; updatedAt: Date } | null;
}) {
  const { t, p } = useI18n();
  const lat = location ? Number(location.lat) : NaN;
  const lng = location ? Number(location.lng) : NaN;
  const live = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  // Sharing pauses when the technician's screen locks: don't call an old position "live".
  const fresh = !!live && isRecent(location!.updatedAt, 5);
  const time = location ? new Date(location.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <div className="mt-5 rounded-2xl border-2 border-bird bg-white p-4">
      <div className="flex items-center gap-3">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 shrink-0 rounded-full border-2 border-bird object-cover"
          />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-bird bg-bird/10 text-bird">
            <MapPin className="h-5 w-5" />
          </span>
        )}
        <div>
          <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/70">
            {p(t.tracking.techOnWay)}
          </p>
          <p className="font-display text-base font-extrabold text-navy">{name ?? "Be Right"}</p>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-navy/70">
            {rating.average !== null ? (
              <>
                <Stars value={rating.average} size={13} />
                {rating.average.toFixed(1)} · {rating.count} {p(t.rating.jobs)}
              </>
            ) : (
              <>
                <Star className="h-3.5 w-3.5 text-flame" fill="currentColor" aria-hidden />
                {p(t.rating.new)}
              </>
            )}
          </span>
        </div>
        {fresh && (
          <span className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-bird px-3 py-1 text-xs font-bold text-white">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            {p(t.tracking.liveLocation)}
          </span>
        )}
      </div>
      {(home || live) && (
        <div className="mt-3">
          <JobMap home={home} technician={live} technicianLabel={initials(name)} />
        </div>
      )}
      {live ? (
        <p className="mt-2 text-xs text-navy/70">
          {fresh ? `${p(t.tracking.lastUpdate)}: ${time}` : p(t.tracking.lastSeen).replace("{time}", time)}
        </p>
      ) : (
        <p className="mt-3 text-sm text-navy/70">{p(t.tracking.noLocationYet)}</p>
      )}
    </div>
  );
}

export default function Requests() {
  const { t, p, lang } = useI18n();
  const { role, isLoading: authLoading } = useRoleGate(["customer"], { requireSignIn: true });
  const isAuthenticated = role === "customer";
  const [openId, setOpenId] = useState<number | null>(null);
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
                      {p(t.requests.preferred)}: {r.preferredDate} · {r.area}
                    </span>
                  </span>
                  <StatusBadge status={r.status as RequestStatus} />
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-navy transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>

                {open && detail.data && detail.data.request.id === r.id && (
                  <div className="border-t-2 border-navy/10 p-5 animate-rise-in">
                    {detail.data.request.guaranteeFor && (
                      <p className="mb-4 text-sm font-semibold text-navy">
                        {p(t.requests.guaranteeFor).replace("{id}", String(detail.data.request.guaranteeFor))}
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

                    {/* urgency + quote */}
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border-2 border-navy/15 bg-paper p-4">
                        <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/70">
                          {p(t.requests.urgency)}
                        </p>
                        <p className="mt-2 font-display text-lg font-extrabold text-navy">
                          {p(
                            URGENCY_META[
                              (detail.data.request.urgencyFinal ??
                                detail.data.request
                                  .urgencySuggested) as UrgencyLevel
                            ].label,
                          )}
                        </p>
                      </div>
                      <div className="rounded-2xl border-2 border-navy/15 bg-paper p-4">
                        <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/70">
                          {p(t.requests.quote)}
                        </p>
                        {detail.data.request.quoteAmount ? (
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
                          </>
                        ) : (
                          <p className="mt-2 text-sm text-navy/70">—</p>
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
                          onClick={() => cancel.mutate({ id: r.id })}
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
                        onClick={() => cancel.mutate({ id: r.id })}
                        disabled={cancel.isPending}
                        className="mt-6 text-sm font-bold text-destructive underline underline-offset-4"
                      >
                        {p(t.requests.cancel)}
                      </button>
                    )}
                    {detail.data.request.status === "completed" && (
                      <>
                        <RateJob key={`rate-${r.id}`} requestId={r.id} rated={!!detail.data.review} />
                        <Link to={`/book?cat=${detail.data.request.category}`} className="btn-pill-outline mt-4 !px-5 !py-2">
                          <Repeat className="h-4 w-4" aria-hidden />
                          {p(t.rebook)}
                        </Link>
                      </>
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

                    {/* after scheduling: ask a specialist to cancel */}
                    {CANCEL_REQUESTABLE_STATUSES.includes(detail.data.request.status as RequestStatus) &&
                      (detail.data.request.cancelRequestedAt ? (
                        <p className="mt-6 rounded-xl bg-navy/5 p-3 text-sm font-semibold text-navy">
                          {p(t.requests.cancelAsked).replace(
                            "{date}",
                            new Date(detail.data.request.cancelRequestedAt).toLocaleDateString(lang === "ar" ? "ar-LB" : "en-GB", {
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
                            onClick={() => requestCancel.mutate({ id: r.id, reason: cancelReason.trim() || undefined })}
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
