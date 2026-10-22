import { useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronRight, Loader2, MapPin, Navigation, Phone } from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { AnswerList } from "@/components/AnswerList";
import { MediaGrid } from "@/components/MediaGrid";
import { BeforeAfter, JobPhotoUpload } from "@/components/JobPhotos";
import JobMap from "@/components/map/JobMap";
import { DirectionsLinks } from "@/components/map/DirectionsLinks";
import { PartsShopsNearJob } from "@/components/PartsShopsNearJob";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { formatVisitDay } from "@/lib/time";
import { telLink } from "@/lib/contact";
import { isNativeApp } from "@/lib/native";
import { CATEGORY_MAP, type RequestStatus } from "@contracts/services";
import { VISIT_REPORTS } from "@contracts/workflow";
import { isTodo, jobStep, type Job } from "@/lib/techJob";

/** The job's live location for its customer ("On my way"), from the page (src/pages/Tech.tsx). */
export type Sharing = { sharingFor: number | null; geoError: boolean; start: (id: number) => void; stop: () => void };

const LABEL = "font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/60";

function useJobText() {
  const { t, p, lang } = useI18n();
  const service = (job: Job) => (CATEGORY_MAP[job.category] ? p(CATEGORY_MAP[job.category].name) : job.category);
  const slot = (job: Job) =>
    p({ morning: t.book.slotMorning, afternoon: t.book.slotAfternoon, evening: t.book.slotEvening }[job.timeSlot as "morning"] ?? { en: job.timeSlot, ar: job.timeSlot });
  const when = (job: Job) => `${formatVisitDay(job.preferredDate, lang)} · ${slot(job)}`;
  const next = (job: Job) => {
    const step = jobStep(job);
    const text = { 1: t.tech.nextGo, 2: t.tech.nextStart, 3: t.tech.nextFinish, wait: t.tech.nextWait }[step as 1];
    return text ? p(text) : null;
  };
  return { service, when, next };
}

function StatusChip({ job }: { job: Job }) {
  const { t, p } = useI18n();
  return (
    <span className="shrink-0 rounded-full border-2 border-navy/20 px-2.5 py-0.5 text-[11px] font-bold text-navy">
      {p(t.status[job.status as RequestStatus])}
    </span>
  );
}

/** One job in the list: what, when, where, and the next step. */
export function JobCard({ job, sharing, onOpen }: { job: Job; sharing: boolean; onOpen: () => void }) {
  const { t, p } = useI18n();
  const text = useJobText();
  const next = isTodo(job) ? text.next(job) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card-br flex w-full items-center gap-3 p-4 text-start transition-shadow hover:shadow-[0_6px_18px_rgb(12_43_92/0.10)] sm:p-5"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-navy/15 bg-paper text-bird">
        <ServiceIcon id={job.category} className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-display text-base font-extrabold text-navy">
            #{job.id} · {text.service(job)}
          </span>
          {job.emergency && <span className="rounded-full bg-flame px-2 py-px text-[11px] font-bold text-white">{p(t.emergency.badge)}</span>}
        </span>
        <span className="mt-0.5 block text-xs text-navy/70">{text.when(job)}</span>
        {job.area && job.area !== "-" && (
          <span className="mt-0.5 flex items-center gap-1 text-xs text-navy/60">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden /> {job.area}
          </span>
        )}
        {next && (
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-flame/10 px-2.5 py-1 text-xs font-bold text-flame-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-flame" /> {p(t.tech.next).replace("{step}", next)}
          </span>
        )}
        {sharing && (
          <span className="ms-2 mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-bird">
            <Navigation className="h-3.5 w-3.5" /> {p(t.tech.sharing)}
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-2">
        <StatusChip job={job} />
        <ChevronRight className="h-5 w-5 text-navy/40 rtl:-scale-x-100" aria-hidden />
      </span>
    </button>
  );
}

/** The 4 steps, the current one highlighted. */
function Steps({ step }: { step: 1 | 2 | 3 | 4 }) {
  const { t, p } = useI18n();
  const labels = [t.tech.steps.go, t.tech.steps.start, t.tech.steps.finish, t.tech.steps.done];
  return (
    <ol className="flex items-start" aria-label={p(t.tech.stepOf).replace("{n}", String(step))}>
      {labels.map((label, i) => {
        const n = i + 1;
        const done = n < step || step === 4;
        const current = n === step && step !== 4;
        return (
          <li key={n} className="relative flex flex-1 flex-col items-center text-center" aria-current={current ? "step" : undefined}>
            {i > 0 && (
              <span className={`absolute end-1/2 top-4 h-0.5 w-full -translate-y-1/2 ${n <= step ? "bg-navy" : "bg-navy/15"}`} aria-hidden />
            )}
            <span
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-black ${
                done
                  ? "border-navy bg-navy text-white"
                  : current
                    ? "border-flame bg-flame text-white shadow-[0_0_0_4px_rgb(255_90_31/0.18)]"
                    : "border-navy/20 bg-white text-navy/40"
              }`}
            >
              {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
            </span>
            <span className={`mt-1.5 text-[11px] font-bold ${current ? "text-flame-ink" : done ? "text-navy" : "text-navy/45"}`}>{p(label)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** One job, opened: its steps, what to do now, and its details in tabs. */
export function JobView({ job: r, sharing, onBack }: { job: Job; sharing: Sharing; onBack: () => void }) {
  const { t, p } = useI18n();
  const text = useJobText();
  const utils = trpc.useUtils();
  const step = jobStep(r);
  const todo = isTodo(r);
  const [tab, setTab] = useState<"customer" | "job" | "parts">("customer");
  const tabs = (
    [
      ["customer", t.tech.tabCustomer],
      ["job", t.tech.tabJob],
      ...(todo ? ([["parts", t.tech.tabParts]] as const) : []),
    ] as const
  ).map(([id, label]) => ({ id, label: p(label) }));
  const customerPhotos = r.media.filter((m) => m.kind === "customer");
  const hasPrep = !!(r.prepDiagnosis || r.prepTools || r.prepParts || r.prepInstructions);

  return (
    <div className="mt-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-navy">
        <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" /> {p(t.tech.allJobs)}
      </button>

      {/* the job */}
      <section className="card-br mt-3 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-navy/15 bg-paper text-bird">
            <ServiceIcon id={r.category} className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-black text-navy">
              #{r.id} · {text.service(r)}
            </h2>
            <p className="text-sm text-navy/70">{text.when(r)}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {r.emergency && <span className="rounded-full bg-flame px-2 py-px text-[11px] font-bold text-white">{p(t.emergency.badge)}</span>}
              {r.guaranteeFor && (
                <span className="text-xs font-bold text-bird">{p(t.requests.guaranteeFor).replace("{id}", String(r.guaranteeFor))}</span>
              )}
            </div>
          </div>
          <StatusChip job={r} />
        </div>
        {typeof step === "number" && (
          <div className="mt-5">
            <Steps step={step} />
          </div>
        )}
      </section>

      {/* what to do now */}
      <NowPanel key={`${r.id}-${r.status}-${r.arrived}`} job={r} sharing={sharing} onChanged={() => void utils.tech.myJobs.invalidate()} />

      {/* the details */}
      <div role="tablist" className="mt-6 grid gap-1 rounded-xl border border-navy/12 bg-white p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={`h-10 rounded-lg px-2 text-sm font-semibold transition-colors ${
              tab === x.id ? "bg-navy text-paper" : "text-navy/65 hover:bg-navy/5"
            }`}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="mt-3" role="tabpanel">
        {tab === "customer" && (
          <div className="flex flex-col gap-3">
            <div className="card-br p-4 text-sm">
              {r.contactName && <p className="font-display text-base font-extrabold text-navy">{r.contactName}</p>}
              <p className="mt-0.5 font-semibold text-navy">{r.area}</p>
              <p className="text-navy/75">{r.address}</p>
              {r.notes && <p className="mt-2 rounded-xl bg-navy/5 p-3 italic text-navy/80">{r.notes}</p>}
              <div className="mt-3">
                {r.phone ? (
                  <a href={telLink(r.phone)} className="btn-pill-outline !min-h-11 !py-2 text-sm" dir="ltr">
                    <Phone className="h-4 w-4" /> {p(t.tech.call)} {r.phone}
                  </a>
                ) : (
                  <p className="text-navy/55">{p(t.emergency.phoneSoon)}</p>
                )}
              </div>
            </div>
            {r.lat != null && r.lng != null && (
              <div className="flex flex-col gap-3">
                <JobMap home={{ lat: r.lat, lng: r.lng }} />
                {todo && <DirectionsLinks lat={r.lat} lng={r.lng} />}
              </div>
            )}
          </div>
        )}

        {tab === "job" && (
          <div className="flex flex-col gap-3">
            {hasPrep && (
              <div className="rounded-2xl border-2 border-bird bg-bird/5 p-4 text-sm">
                <p className={LABEL}>{p(t.tech.fromSpecialist)}</p>
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
            <div className="card-br p-4">
              <p className={LABEL}>{p(t.tech.problem)}</p>
              <AnswerList category={r.category} answersJson={r.answers} className="mt-2 flex flex-col gap-1.5 text-sm" />
              {customerPhotos.length > 0 && (
                <>
                  <p className={`${LABEL} mt-4`}>{p(t.tech.photos)}</p>
                  <MediaGrid items={customerPhotos} className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4" />
                </>
              )}
            </div>
          </div>
        )}

        {tab === "parts" && (
          <PartsShopsNearJob trade={r.category} home={r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null} defaultOpen />
        )}
      </div>
    </div>
  );
}

function Panel({ title, hint, children, tone = "flame" }: { title: string; hint?: string; children?: ReactNode; tone?: "flame" | "navy" | "green" }) {
  const border = { flame: "border-flame bg-flame/[0.04]", navy: "border-navy/15 bg-white", green: "border-green-700/40 bg-green-700/[0.05]" }[tone];
  return (
    <section className={`mt-4 rounded-3xl border-2 p-4 sm:p-5 ${border}`}>
      <h3 className="font-display text-lg font-black text-navy">{title}</h3>
      {hint && <p className="mt-0.5 text-sm text-navy/70">{hint}</p>}
      {children}
    </section>
  );
}

/** What the technician does now on this job, and nothing else: one step at a time. */
function NowPanel({ job: r, sharing, onChanged }: { job: Job; sharing: Sharing; onChanged: () => void }) {
  const { t, p } = useI18n();
  const step = jobStep(r);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const fieldEvent = trpc.tech.fieldEvent.useMutation({ onSuccess: onChanged });
  // A visit without a repair goes to the specialist, who decides about the visit fee.
  const reportVisit = trpc.tech.reportVisit.useMutation({ onSuccess: () => setReported(true) });
  const hasBefore = r.media.some((m) => m.kind === "before");
  const hasAfter = r.media.some((m) => m.kind === "after");
  const isSharing = sharing.sharingFor === r.id;
  const busy = fieldEvent.isPending;
  const act = (action: "arrived" | "start" | "complete") =>
    fieldEvent.mutate(
      { requestId: r.id, action, note: note.trim() || undefined },
      // There (or done): the customer stops seeing them on the map.
      { onSuccess: () => isSharing && sharing.stop() },
    );

  if (step === "cancelled") {
    return (
      <Panel title={p(t.tech.cancelledNote)} tone="navy">
        <div className="mt-3 empty:hidden">
          <BeforeAfter media={r.media} />
        </div>
      </Panel>
    );
  }
  if (step === 4) {
    return (
      <Panel title={p(t.tech.doneTitle)} tone="green">
        <div className="mt-3 empty:hidden">
          <BeforeAfter media={r.media} />
        </div>
      </Panel>
    );
  }
  if (step === "wait") return <Panel title={p(t.tech.waitTitle)} hint={p(t.tech.waitHint)} tone="navy" />;

  const extras = (
    <>
      {/* a note for the specialist goes with the next button */}
      {noteOpen ? (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={p(t.tech.notePh)}
          aria-label={p(t.tech.notePh)}
          autoFocus
          className="mt-4 min-h-12 w-full rounded-2xl border-2 border-navy/30 bg-white px-4 text-sm font-semibold text-navy focus:border-flame focus:outline-none"
        />
      ) : (
        <button type="button" onClick={() => setNoteOpen(true)} className="mt-4 text-sm font-bold text-navy/70 underline underline-offset-4">
          {p(t.tech.noteOptional)}
        </button>
      )}
      {(fieldEvent.isError || reportVisit.isError) && <p className="mt-3 text-sm font-semibold text-destructive">{p(t.misc.error)}</p>}
      {/* no repair at this visit: tell the specialist (guarantee visits never have a fee) */}
      {!r.guaranteeFor && (
        <details className="mt-4 rounded-2xl border-2 border-dashed border-navy/20 p-3">
          <summary className="cursor-pointer text-sm font-bold text-navy">{p(t.visitFee.techTitle)}</summary>
          <p className="mt-1 text-xs text-navy/70">{p(t.visitFee.techHint)}</p>
          {reported ? (
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
                  onClick={() => reportVisit.mutate({ requestId: r.id, reason, note: note.trim() || undefined })}
                  className="btn-pill-outline !min-h-11 justify-center !px-3 text-sm"
                >
                  {p(t.visitFee.reasons[reason])}
                </button>
              ))}
            </div>
          )}
        </details>
      )}
    </>
  );

  if (step === 1) {
    return (
      <Panel title={`${p(t.tech.stepOf).replace("{n}", "1")} · ${p(t.tech.goTitle)}`} hint={p(t.tech.goHint)}>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => (isSharing ? sharing.stop() : sharing.start(r.id))}
            className={`btn-pill w-full justify-center ${isSharing ? "border-bird bg-white text-bird" : "border-bird bg-bird text-white"}`}
          >
            <Navigation className="h-4 w-4" />
            {isSharing ? p(t.tech.shareStop) : p(t.tech.shareStart)}
          </button>
          <button type="button" onClick={() => act("arrived")} disabled={busy} className="btn-pill-primary w-full justify-center disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            {p(t.tech.arrived)}
          </button>
        </div>
        {isSharing && (
          <p className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-bird">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bird opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-bird" />
            </span>
            {p(t.tech.sharing)}
          </p>
        )}
        <p className="mt-3 text-xs text-navy/60">{p(isNativeApp ? t.tech.goKeepApp : t.tech.goKeepWeb)}</p>
        {sharing.geoError && <p className="mt-2 text-sm font-semibold text-destructive">{p(t.tech.geoError)}</p>}
        {r.lat != null && r.lng != null && (
          <div className="mt-4">
            <DirectionsLinks lat={r.lat} lng={r.lng} />
          </div>
        )}
        {extras}
      </Panel>
    );
  }

  if (step === 2) {
    return (
      <Panel title={`${p(t.tech.stepOf).replace("{n}", "2")} · ${p(t.tech.startTitle)}`} hint={p(t.tech.startHint)}>
        <div className="mt-4">
          <JobPhotoUpload requestId={r.id} kind="before" media={r.media} />
        </div>
        <button type="button" onClick={() => act("start")} disabled={busy || !hasBefore} className="btn-pill-primary mt-4 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {p(t.tech.startWork)}
        </button>
        {!hasBefore && <p className="mt-2 text-xs font-semibold text-navy/70">{p(t.jobPhotos.needBefore)}</p>}
        {extras}
      </Panel>
    );
  }

  return (
    <Panel title={`${p(t.tech.stepOf).replace("{n}", "3")} · ${p(t.tech.finishTitle)}`} hint={p(t.tech.finishHint)}>
      <div className="mt-4">
        <JobPhotoUpload requestId={r.id} kind="after" media={r.media} />
      </div>
      <button type="button" onClick={() => act("complete")} disabled={busy || !hasAfter} className="btn-pill-primary mt-4 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {p(t.tech.complete)}
      </button>
      {!hasAfter && <p className="mt-2 text-xs font-semibold text-navy/70">{p(t.jobPhotos.needAfter)}</p>}
      {extras}
    </Panel>
  );
}
