import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, MapPin, Navigation } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ServiceIcon } from "@/components/ServiceIcon";
import { AnswerList } from "@/components/AnswerList";
import { MediaGrid } from "@/components/MediaGrid";
import { BeforeAfter, JobPhotoUpload } from "@/components/JobPhotos";
import JobMap from "@/components/map/JobMap";
import { DirectionsLinks } from "@/components/map/DirectionsLinks";
import { useI18n } from "@/i18n";
import { PartsShopsNearJob } from "@/components/PartsShopsNearJob";
import { formatDay, formatVisitDay } from "@/lib/time";
import { telLink } from "@/lib/contact";
import { useRoleGate } from "@/hooks/useRoleGate";
import { isNativeApp } from "@/lib/native";
import { startJobLocation, stopJobLocation, usePresence } from "@/lib/presence";
import { useTrackingNotice } from "@/hooks/useTrackingNotice";
import { Availability } from "@/components/tech/Availability";
import { trpc } from "@/providers/trpc";
import {
  CATEGORY_MAP,
  type RequestStatus,
} from "@contracts/services";
import { ACTIVE_JOB_STATUSES, VISIT_REPORTS } from "@contracts/workflow";

/**
 * A job's live location for its customer, through the shared tracker (src/lib/presence.ts):
 * in the phone app it keeps going with the screen locked. Stops by itself once that job is no
 * longer active for this technician (completed, cancelled, reassigned).
 */
function useLocationSharing(activeJobIds: readonly number[] | undefined) {
  const presence = usePresence();
  const notice = useTrackingNotice();
  // The job the technician last tried to share: a problem shows on that job's card.
  const [triedFor, setTriedFor] = useState<number | null>(null);
  const sharingFor = presence.sharedJob;

  // The jobs list refreshes every minute and after each field action.
  const jobGone = sharingFor !== null && activeJobIds !== undefined && !activeJobIds.includes(sharingFor);
  useEffect(() => {
    if (jobGone) stopJobLocation();
  }, [jobGone]);

  const start = (requestId: number) => {
    setTriedFor(requestId);
    void startJobLocation(requestId, notice);
  };
  const stop = () => {
    setTriedFor(null);
    stopJobLocation();
  };
  const geoError = triedFor !== null && sharingFor === null && !!presence.problem;
  return { sharingFor: jobGone ? null : sharingFor, geoError, start, stop };
}

export default function Tech() {
  const { t, p, lang } = useI18n();
  const { role, isLoading: authLoading } = useRoleGate(["technician"], { requireSignIn: true });
  const utils = trpc.useUtils();
  const isTech = role === "technician";

  const jobs = trpc.tech.myJobs.useQuery(undefined, { enabled: !!isTech, refetchInterval: 60_000 });
  const fieldEvent = trpc.tech.fieldEvent.useMutation({
    onSuccess: () => utils.tech.myJobs.invalidate(),
  });
  const activeJobIds = useMemo(
    () => jobs.data?.filter((j) => ACTIVE_JOB_STATUSES.includes(j.status as RequestStatus)).map((j) => j.id),
    [jobs.data],
  );
  const { sharingFor, geoError, start, stop } = useLocationSharing(activeJobIds);
  const [notes, setNotes] = useState<Record<number, string>>({});
  // A visit without a repair goes to the specialist, who decides about the visit fee.
  const reportVisit = trpc.tech.reportVisit.useMutation();
  const [reported, setReported] = useState<Record<number, boolean>>({});
  // Jobs fold to one line each; until the technician opens or closes one, the next active job is open.
  const [openIds, setOpenIds] = useState<Set<number> | null>(null);

  if (authLoading || !isTech) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Loader2 className="h-8 w-8 animate-spin text-navy" />
      </div>
    );
  }

  const rows = jobs.data ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-24 sm:px-6">
        <h1 className="font-display text-3xl font-black text-navy sm:text-4xl">
          {p(t.tech.title)}
        </h1>

        <Availability />

        {rows.length === 0 && !jobs.isLoading && (
          <div className="card-br mt-10 p-10 text-center font-semibold text-navy/70">
            {p(t.tech.empty)}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3">
          {rows.map((r) => {
            const active = ACTIVE_JOB_STATUSES.includes(r.status as RequestStatus);
            const firstActive = rows.find((x) => ACTIVE_JOB_STATUSES.includes(x.status as RequestStatus))?.id;
            const isOpen = openIds ? openIds.has(r.id) : r.id === firstActive;
            const toggle = () =>
              setOpenIds((prev) => {
                const next = new Set(prev ?? (firstActive ? [firstActive] : []));
                if (next.has(r.id)) next.delete(r.id);
                else next.add(r.id);
                return next;
              });
            const sharing = sharingFor === r.id;
            const customerPhotos = r.media.filter((m) => m.kind === "customer");
            const hasBefore = r.media.some((m) => m.kind === "before");
            const hasAfter = r.media.some((m) => m.kind === "after");
            return (
              <div key={r.id} className={`card-br p-4 sm:p-5 ${active ? "" : "bg-white/70"}`}>
                <button type="button" onClick={toggle} aria-expanded={isOpen} className="flex w-full items-start justify-between gap-3 text-start">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-navy/15 bg-paper text-bird">
                      <ServiceIcon id={r.category} className="h-6 w-6" />
                    </span>
                    <div>
                      <p className="font-display text-base font-extrabold text-navy">
                        #{r.id} ·{" "}
                        {CATEGORY_MAP[r.category]
                          ? p(CATEGORY_MAP[r.category].name)
                          : r.category}
                      </p>
                      <p className="text-xs text-navy/70">
                        {p(t.tech.appointment)}: {formatVisitDay(r.preferredDate, lang)} · {r.timeSlot}
                      </p>
                      <p className="text-xs text-navy/60">
                        {p(t.requests.requestedOn)}: {formatDay(r.createdAt, lang)}
                      </p>
                      {!isOpen && r.area && r.area !== "-" && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-navy/60">
                          <MapPin className="h-3 w-3 shrink-0" aria-hidden /> {r.area}
                        </p>
                      )}
                      {r.emergency && (
                        <p className="mt-1 inline-flex rounded-full bg-flame px-2 py-px text-[11px] font-bold text-white">
                          {p(t.emergency.badge)}
                        </p>
                      )}
                      {r.guaranteeFor && (
                        <p className="mt-1 text-xs font-bold text-bird">
                          {p(t.requests.guaranteeFor).replace("{id}", String(r.guaranteeFor))}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full border-2 border-navy/25 px-3 py-1 text-xs font-bold text-navy">
                      {p(t.status[r.status as RequestStatus])}
                    </span>
                    <ChevronDown className={`h-5 w-5 text-navy/50 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                  </span>
                </button>

                {isOpen && (
                <>
                <div className="mt-4 rounded-2xl border-2 border-navy/15 bg-paper p-4 text-sm text-navy/80">
                  <p className="font-bold text-navy">{r.area}</p>
                  <p>{r.address}</p>
                  {r.contactName && <p className="mt-1 font-semibold text-navy">{r.contactName}</p>}
                  {r.phone ? (
                    <a href={telLink(r.phone)} dir="ltr" className="mt-1 block text-start font-semibold text-flame-ink underline underline-offset-2">
                      {r.phone}
                    </a>
                  ) : (
                    <p className="mt-1 text-navy/55">{p(t.emergency.phoneSoon)}</p>
                  )}
                  {r.notes && <p className="mt-1 italic">{r.notes}</p>}
                </div>

                {(r.prepDiagnosis || r.prepTools || r.prepParts || r.prepInstructions) && (
                  <div className="mt-4 rounded-2xl border-2 border-bird bg-bird/5 p-4 text-sm">
                    <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/70">
                      {p(t.tech.fromSpecialist)}
                    </p>
                    <dl className="mt-2 flex flex-col gap-2">
                      {(
                        [
                          [t.dash4.prepDiagnosis, r.prepDiagnosis],
                          [t.dash4.prepTools, r.prepTools],
                          [t.dash4.prepParts, r.prepParts],
                          [t.dash4.prepInstructions, r.prepInstructions],
                        ] as const
                      ).map(
                        ([label, value]) =>
                          value && (
                            <div key={label.en}>
                              <dt className="text-xs font-bold text-navy/70">{p(label)}</dt>
                              <dd className="whitespace-pre-line font-semibold text-navy">{value}</dd>
                            </div>
                          ),
                      )}
                    </dl>
                  </div>
                )}

                {r.lat != null && r.lng != null && (
                  <div className="mt-4 flex flex-col gap-3">
                    <JobMap home={{ lat: r.lat, lng: r.lng }} />
                    <DirectionsLinks lat={r.lat} lng={r.lng} />
                  </div>
                )}

                <div className="mt-4 rounded-2xl border-2 border-navy/15 p-4">
                  <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/70">
                    {p(t.tech.problem)}
                  </p>
                  <AnswerList category={r.category} answersJson={r.answers} className="mt-2 flex flex-col gap-1.5 text-sm" />
                  {customerPhotos.length > 0 && (
                    <>
                      <p className="mt-4 font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/70">
                        {p(t.tech.photos)}
                      </p>
                      <MediaGrid items={customerPhotos} className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4" />
                    </>
                  )}
                </div>

                {!active && (hasBefore || hasAfter) && (
                  <div className="mt-4 rounded-2xl border-2 border-navy/15 p-4">
                    <BeforeAfter media={r.media} />
                  </div>
                )}

                {active && (
                  <div className="mt-4 flex flex-col gap-3">
                    {/* live location */}
                    <div className="rounded-2xl border-2 border-dashed border-bird/50 bg-bird/5 p-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-navy">
                        <Navigation className="h-4 w-4 text-bird" />
                        {p(t.tracking.liveLocation)}
                      </div>
                      <p className="mt-1 text-xs text-navy/70">
                        {p(isNativeApp ? t.tech.shareHintApp : t.tech.shareHint)}
                      </p>
                      {geoError && (
                        <p className="mt-2 text-xs font-semibold text-destructive">
                          {p(t.tech.geoError)}
                        </p>
                      )}
                      <button
                        onClick={() => (sharing ? stop() : start(r.id))}
                        className={`btn-pill mt-3 w-full sm:w-auto ${
                          sharing
                            ? "border-flame bg-flame text-white"
                            : "border-bird bg-bird text-white"
                        }`}
                      >
                        <MapPin className="h-4 w-4" />
                        {sharing ? p(t.tech.shareStop) : p(t.tech.shareStart)}
                      </button>
                      {sharing && (
                        <span className="ms-3 inline-flex items-center gap-1.5 text-xs font-bold text-bird">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bird opacity-60" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-bird" />
                          </span>
                          {p(t.tech.sharing)}
                        </span>
                      )}
                    </div>

                    {/* partner shops to pick a part up from, nearest to this job first */}
                    <PartsShopsNearJob trade={r.category} home={r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null} />

                    {/* before/after photos: needed to start and to complete the work */}
                    <JobPhotoUpload requestId={r.id} kind="before" media={r.media} />
                    <JobPhotoUpload
                      requestId={r.id}
                      kind="after"
                      media={r.media}
                      locked={r.status !== "in_progress"}
                    />

                    {/* field actions */}
                    <input
                      value={notes[r.id] ?? ""}
                      onChange={(e) =>
                        setNotes((n) => ({ ...n, [r.id]: e.target.value }))
                      }
                      placeholder={p(t.tech.notePh)}
                      className="min-h-12 rounded-2xl border-2 border-navy/30 bg-white px-4 text-sm font-semibold text-navy focus:border-flame focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      {r.status === "scheduled" && (
                        <>
                          <button
                            onClick={() =>
                              fieldEvent.mutate({
                                requestId: r.id,
                                action: "arrived",
                                note: notes[r.id] || undefined,
                              })
                            }
                            disabled={fieldEvent.isPending}
                            className="btn-pill-outline"
                          >
                            {p(t.tech.arrived)}
                          </button>
                          <button
                            onClick={() =>
                              fieldEvent.mutate({
                                requestId: r.id,
                                action: "start",
                                note: notes[r.id] || undefined,
                              })
                            }
                            disabled={fieldEvent.isPending || !hasBefore}
                            className="btn-pill-primary disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {fieldEvent.isPending && (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            )}
                            {p(t.tech.startWork)}
                          </button>
                          {!hasBefore && (
                            <p className="w-full text-xs font-semibold text-navy/70">{p(t.jobPhotos.needBefore)}</p>
                          )}
                        </>
                      )}
                      {r.status === "in_progress" && (
                        <button
                          onClick={() => {
                            fieldEvent.mutate({
                              requestId: r.id,
                              action: "complete",
                              note: notes[r.id] || undefined,
                            });
                            if (sharing) stop();
                          }}
                          disabled={fieldEvent.isPending || !hasAfter}
                          className="btn-pill-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {fieldEvent.isPending && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                          {p(t.tech.complete)}
                        </button>
                      )}
                      {r.status === "in_progress" && !hasAfter && (
                        <p className="w-full text-xs font-semibold text-navy/70">{p(t.jobPhotos.needAfter)}</p>
                      )}
                    </div>
                    {/* no repair at this visit: tell the specialist (guarantee visits never have a fee) */}
                    {!r.guaranteeFor && (
                      <div className="rounded-2xl border-2 border-dashed border-navy/20 p-4">
                        <p className="text-sm font-bold text-navy">{p(t.visitFee.techTitle)}</p>
                        <p className="text-xs text-navy/70">{p(t.visitFee.techHint)}</p>
                        {reported[r.id] ? (
                          <p role="status" className="mt-2 text-sm font-semibold text-green-800">
                            {p(t.visitFee.techSent)}
                          </p>
                        ) : (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {VISIT_REPORTS.map((reason) => (
                              <button
                                key={reason}
                                type="button"
                                disabled={reportVisit.isPending}
                                onClick={() =>
                                  reportVisit.mutate(
                                    { requestId: r.id, reason, note: notes[r.id] || undefined },
                                    { onSuccess: () => setReported((x) => ({ ...x, [r.id]: true })) },
                                  )
                                }
                                className="btn-pill-outline !min-h-11 justify-center !px-3 text-sm"
                              >
                                {p(t.visitFee.reasons[reason])}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {(fieldEvent.isError || reportVisit.isError) && (
                      <p className="text-sm font-semibold text-destructive">
                        {p(t.misc.error)}
                      </p>
                    )}
                  </div>
                )}
                </>
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
