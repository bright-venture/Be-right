import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ImagePlus,
  Loader2,
  X,
  ReceiptText,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ServiceIcon } from "@/components/ServiceIcon";
import { AuthPanel } from "@/components/AuthPanel";
import { AgreeCheckbox } from "@/components/AgreeCheckbox";
import { useI18n } from "@/i18n";
import { useRoleGate } from "@/hooks/useRoleGate";
import { trpc } from "@/providers/trpc";
import { supabase } from "@/lib/supabase";
import LocationPicker, { type Pin } from "@/components/map/LocationPicker";
import { isValidPin } from "@contracts/geo";
import { isValidPhone } from "@contracts/phone";
import { isNetworkError, isRateLimited, refusalMessage } from "@/lib/errors";
import {
  clearDraft,
  loadDraftFields,
  loadDraftFiles,
  saveDraftFields,
  saveDraftFiles,
} from "@/lib/bookingDraft";
import {
  SERVICES_IN_ORDER,
  CATEGORY_MAP,
  CATEGORY_TINT,
  computeUrgency,
  URGENCY_META,
  type UrgencyLevel,
} from "@contracts/services";
import {
  answersFromLink,
  isValidVisitDate,
  MAX_BOOKING_FILES,
  MAX_BOOKING_VIDEOS,
  TIME_SLOTS,
  todayHere,
  type TimeSlot,
} from "@contracts/workflow";
import { shrinkImage } from "@/lib/shrinkImage";
import { MEDIA_ACCEPT } from "@contracts/uploads";

/** A photo/video kept on the device until the request is submitted. */
type MediaDraft = {
  id: string;
  file: File;
  previewUrl: string;
};

function toMediaDraft(file: File): MediaDraft {
  return { id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) };
}

const URGENCY_BADGE: Record<UrgencyLevel, string> = {
  normal: "border-navy text-navy",
  priority: "border-bird bg-bird text-white",
  urgent: "border-flame bg-flame text-white",
  critical: "border-navy bg-navy text-white",
};

const MAX_FILE_BYTES = 20 * 1024 * 1024;

const STEPS = ["stepCategory", "stepQuestions", "stepPhotos", "stepWhen", "stepReview"] as const;

export default function Book() {
  const { t, p } = useI18n();
  // Visitors can fill everything in; staff accounts are sent to their workspace.
  const { user, isAuthenticated, isLoading: authLoading } = useRoleGate(["customer"]);
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const initialCat = params.get("cat") ?? "";
  // The home page's service picker hands over the problem, the area and "emergency".
  const fromPicker = params.has("ans") || params.has("area") || params.get("priority") === "1";
  // Restore an unfinished booking (e.g. after returning from the sign-in email link),
  // unless the visitor came in for a different service or picked a new problem.
  const [draft] = useState(() => {
    const d = loadDraftFields();
    if (d && fromPicker) return null;
    if (d && initialCat && CATEGORY_MAP[initialCat] && d.category !== initialCat) return null;
    return d;
  });
  const [step, setStep] = useState(
    draft?.step ?? (initialCat && CATEGORY_MAP[initialCat] ? 1 : 0),
  );
  const [category, setCategory] = useState(
    draft?.category ?? (initialCat && CATEGORY_MAP[initialCat] ? initialCat : ""),
  );
  const [answers, setAnswers] = useState<Record<string, string>>(
    () => draft?.answers ?? answersFromLink(initialCat, params.get("ans")),
  );
  const [emergency] = useState(() => draft?.emergency ?? params.get("priority") === "1");
  const [media, setMedia] = useState<MediaDraft[]>([]);
  const [uploadError, setUploadError] = useState<"file" | "videos" | null>(null);
  const [preparingFiles, setPreparingFiles] = useState(false);
  const [date, setDate] = useState(draft?.date ?? "");
  const [slot, setSlot] = useState<TimeSlot | "">(
    TIME_SLOTS.includes(draft?.slot as TimeSlot) ? (draft!.slot as TimeSlot) : "",
  );
  const [area, setArea] = useState(draft?.area ?? (params.get("area") ?? "").trim().slice(0, 255));
  const [address, setAddress] = useState(draft?.address ?? "");
  const [phone, setPhone] = useState(draft?.phone ?? "");
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [pin, setPin] = useState<Pin | null>(draft?.pin ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  /** Shown under the submit button; already translated. */
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<number | null>(null);
  const [doneUrgency, setDoneUrgency] = useState<UrgencyLevel | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cat = category ? CATEGORY_MAP[category] : null;
  const questions = useMemo(
    () =>
      (cat?.questions ?? []).filter(
        (q) => !q.when || answers[q.when.id] === q.when.equals,
      ),
    [cat, answers],
  );
  const urgency = category ? computeUrgency(category, answers) : null;
  // Emergency bookings are never below "urgent" (the server applies the same rule).
  if (urgency && emergency && (urgency.level === "normal" || urgency.level === "priority")) urgency.level = "urgent";

  const createUpload = trpc.storage.createUpload.useMutation();
  const createMutation = trpc.requests.create.useMutation();
  const acceptTerms = trpc.auth.acceptTerms.useMutation();
  // Accounts created before the sign-up checkbox (or Google sign-in) accept once here.
  const needsTerms = isAuthenticated && !user?.termsAcceptedAt;
  const [agreedNow, setAgreedNow] = useState(false);

  const stepLabels = [t.book.stepCategory, t.book.stepQuestions, t.book.stepPhotos, t.book.stepWhen, t.book.stepReview];

  // The account's phone (given at sign-up) fills in until the customer types their own.
  const contactPhone = phone || user?.phone || "";
  // Only complain once something is typed (or carried over from the account).
  const phoneInvalid = contactPhone.trim() !== "" && !isValidPhone(contactPhone);
  // A draft saved yesterday can carry yesterday's date.
  const dateInvalid = date !== "" && !isValidVisitDate(date, todayHere());
  const detailsReady =
    !!date && !dateInvalid && !!slot && !!area.trim() && !!address.trim() && isValidPhone(contactPhone) && !!pin && isValidPin(pin.lat, pin.lng);

  /* ---------- draft persistence ---------- */
  const filesRestored = useRef(false);
  useEffect(() => {
    let cancelled = false;
    if (!draft) {
      filesRestored.current = true;
      void saveDraftFiles([]); // drop photos left over from an older, expired draft
      return;
    }
    loadDraftFiles().then((files) => {
      if (cancelled) return;
      filesRestored.current = true;
      setMedia(files.map(toMediaDraft));
    });
    return () => {
      cancelled = true;
    };
  }, [draft]);

  useEffect(() => {
    if (doneId !== null || !category) return;
    saveDraftFields({ step, category, answers, date, slot, area, address, phone, notes, pin, emergency });
  }, [doneId, step, category, answers, date, slot, area, address, phone, notes, pin, emergency]);

  useEffect(() => {
    if (filesRestored.current && doneId === null) void saveDraftFiles(media.map((m) => m.file));
  }, [media, doneId]);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files).slice(0, MAX_BOOKING_FILES - media.length);
    if (fileRef.current) fileRef.current.value = "";
    setUploadError(null);
    setPreparingFiles(true);
    let videos = media.filter((m) => m.file.type.startsWith("video/")).length;
    const accepted: MediaDraft[] = [];
    for (const original of picked) {
      if (original.type.startsWith("video/") && ++videos > MAX_BOOKING_VIDEOS) {
        setUploadError("videos");
        continue;
      }
      // Photos are shrunk on the phone: faster uploads on mobile data, less storage.
      const file = await shrinkImage(original);
      if (file.size > MAX_FILE_BYTES || !/^(image|video)\//.test(file.type)) {
        setUploadError("file");
        continue;
      }
      accepted.push(toMediaDraft(file));
    }
    setMedia((m) => [...m, ...accepted]);
    setPreparingFiles(false);
  }

  function questionsAnswered() {
    return questions.every((q) => answers[q.id]);
  }

  async function submit() {
    if (needsTerms && !agreedNow) return;
    setSubmitError(null);
    // Re-check before sending: a restored draft can be out of date (yesterday's date,
    // a short phone saved at sign-up, questions that changed). Go back to the step to fix.
    const fixAt = !category ? 0 : !questionsAnswered() ? 1 : !detailsReady ? 3 : null;
    if (fixAt !== null) {
      setStep(fixAt);
      setSubmitError(p(t.book.fixDetails));
      return;
    }
    setSubmitting(true);
    let uploading = false;
    try {
      if (needsTerms) await acceptTerms.mutateAsync();
      // Photos are uploaded only now that we know who the customer is.
      const uploaded = [];
      for (const [i, m] of media.entries()) {
        setUploadProgress({ done: i, total: media.length });
        const contentType = m.file.type || "application/octet-stream";
        uploading = true;
        const target = await createUpload.mutateAsync({
          fileName: m.file.name,
          size: m.file.size,
          contentType,
        });
        const { error } = await supabase.storage
          .from(target.bucket)
          .uploadToSignedUrl(target.key, target.token, m.file, { contentType });
        if (error) throw error;
        uploaded.push({ key: target.key, fileName: m.file.name, size: m.file.size, contentType });
      }
      uploading = false;
      setUploadProgress(null);
      const res = await createMutation.mutateAsync({
        category,
        answers,
        preferredDate: date,
        timeSlot: slot as TimeSlot, // the "Next" button requires a slot
        area,
        address,
        lat: pin!.lat, // the "Next" button requires a pin
        lng: pin!.lng,
        phone: contactPhone,
        notes: notes || undefined,
        media: uploaded,
        emergency: emergency || undefined,
      });
      await clearDraft();
      setDoneId(res.id);
      setDoneUrgency(res.urgency as UrgencyLevel);
    } catch (err) {
      const reason = refusalMessage(err);
      setSubmitError(
        isRateLimited(err)
          ? p(t.misc.tooMany)
          : isNetworkError(err)
            ? p(t.misc.offline)
            : uploading
              ? p(t.book.photoUploadFailed)
              : reason
                ? p(t.book.refused).replace("{reason}", reason)
                : p(t.misc.error),
      );
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  }

  /* ---------- success ---------- */
  if (doneId !== null) {
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-4 py-24 pt-24">
          <div className="card-br w-full max-w-lg p-8 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-navy bg-flame text-white">
              <Check className="h-8 w-8" />
            </span>
            <h1 className="mt-5 font-display text-3xl font-black text-navy">
              {p(t.book.successTitle)}
            </h1>
            <p className="mt-2 font-display text-sm font-bold uppercase tracking-[0.2em] text-navy/70">
              #{doneId}
            </p>
            {doneUrgency && (
              <span
                className={`mt-4 inline-block rounded-full border-2 px-4 py-1 text-sm font-bold ${URGENCY_BADGE[doneUrgency]}`}
              >
                {p(URGENCY_META[doneUrgency].label)}: {p(URGENCY_META[doneUrgency].note)}
              </span>
            )}
            <p className="mt-4 text-sm leading-relaxed text-navy/70">
              {p(t.book.successBody)}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link to="/requests" className="btn-pill-primary">
                {p(t.book.viewRequests)}
              </Link>
              <button
                onClick={() => navigate(0)}
                className="btn-pill-outline"
              >
                {p(t.book.bookAnother)}
              </button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="dotgrid mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-24 sm:px-6">
        <h1 className="font-display text-3xl font-black text-navy sm:text-4xl">
          {p(t.book.title)}
        </h1>

        {/* segmented progress */}
        <div className="mt-6 flex gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full border border-navy/40 ${
                i <= step ? "bg-flame border-flame" : "bg-white"
              }`}
            />
          ))}
        </div>
        <p className="mt-2 font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/70">
          {step + 1} / {STEPS.length} · {p(stepLabels[step])}
        </p>

        <div className="mt-8 animate-rise-in" key={step}>
          {/* STEP 0 — category */}
          {step === 0 && (
            <>
              <h2 className="font-display text-xl font-extrabold text-navy">
                {p(t.book.pickCategory)}
              </h2>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(3n+2)]:col-span-2">
                {SERVICES_IN_ORDER.map((id) => CATEGORY_MAP[id]).filter(Boolean).map((c) => {
                  const tint = CATEGORY_TINT[c.id] ?? { bg: "#ECEFF4", ink: "#0C2B5C" };
                  const active = category === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCategory(c.id);
                        setAnswers({});
                        setStep(1);
                      }}
                      aria-pressed={active}
                      className={`flex min-h-32 flex-col items-start justify-between rounded-[26px] border-[1.5px] border-navy/12 bg-white p-4 text-start shadow-[0_3px_0_rgb(12_43_92/0.1)] transition-all hover:-translate-y-1 hover:border-navy hover:shadow-[0_6px_0_rgb(12_43_92/0.9)] ${
                        active ? "!border-navy !shadow-[0_6px_0_rgb(244_83_9/0.9)]" : ""
                      }`}
                      style={{
                        background: `linear-gradient(180deg, rgb(255 255 255 / 0.55) 0%, rgb(255 255 255 / 0) 60%), ${tint.bg}`,
                      }}
                    >
                      <span
                        className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgb(8_30_66_/_0.12)]"
                        style={{ color: tint.ink }}
                      >
                        <ServiceIcon id={c.id} className="h-6 w-6" />
                      </span>
                      <span className="font-display text-sm font-extrabold text-navy sm:text-base">
                        {p(c.name)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* STEP 1 — guided questions */}
          {step === 1 && cat && (
            <>
              <h2 className="flex items-center gap-3 font-display text-xl font-extrabold text-navy">
                <ServiceIcon id={cat.id} className="h-7 w-7 text-bird" />
                {p(cat.name)}
              </h2>
              <div className="mt-6 flex flex-col gap-6">
                {questions.map((q) => (
                  <fieldset key={q.id} className="card-br p-5">
                    <legend className="px-2 font-display text-base font-extrabold text-navy">
                      {p(q.label)}
                    </legend>
                    {q.hint && (
                      <p className="mb-3 text-xs font-medium text-flame">
                        {p(q.hint)}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {q.options?.map((o) => {
                        const active = answers[q.id] === o.value;
                        return (
                          <button
                            key={o.value}
                            onClick={() =>
                              setAnswers((a) => ({ ...a, [q.id]: o.value }))
                            }
                            className={`min-h-11 rounded-full border-2 px-5 py-2 text-sm font-bold transition-all active:scale-[0.97] ${
                              active
                                ? "border-navy bg-navy text-paper"
                                : "border-navy/30 bg-white text-navy hover:border-navy"
                            }`}
                          >
                            {p(o.label)}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            </>
          )}

          {/* STEP 2 — photos */}
          {step === 2 && (
            <>
              <h2 className="font-display text-xl font-extrabold text-navy">
                {p(t.book.photosTitle)}
              </h2>
              <p className="mt-1 text-sm text-navy/70">{p(t.book.photosOptional)}</p>
              <div className="card-br mt-5 p-5">
                <p className="rounded-2xl border-2 border-dashed border-flame/60 bg-flame/5 p-4 text-xs leading-relaxed text-navy/80">
                  {p(t.book.photosHint)}
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept={MEDIA_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(e) => onFiles(e.target.files)}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={media.length >= MAX_BOOKING_FILES || preparingFiles}
                  className="btn-pill-outline mt-4 w-full sm:w-auto"
                >
                  {preparingFiles ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                  {p(t.book.addPhotos)}
                </button>
                {uploadError && (
                  <p className="mt-2 text-sm font-semibold text-destructive">
                    {p(uploadError === "videos" ? t.book.tooManyVideos : t.book.uploadFailed)}
                  </p>
                )}
                {media.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {media.map((m) => (
                      <div key={m.id} className="group relative">
                        {m.file.type.startsWith("video/") ? (
                          <video
                            src={m.previewUrl}
                            muted
                            playsInline
                            className="aspect-square w-full rounded-2xl border-2 border-navy object-cover"
                          />
                        ) : (
                          <img
                            src={m.previewUrl}
                            alt={m.file.name}
                            className="aspect-square w-full rounded-2xl border-2 border-navy object-cover"
                          />
                        )}
                        <button
                          onClick={() =>
                            setMedia((arr) => arr.filter((x) => x.id !== m.id))
                          }
                          className="absolute -end-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-navy bg-white text-navy"
                          aria-label="Remove"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* STEP 3 — time & place */}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              <div className="card-br p-5">
                <label className="font-display text-base font-extrabold text-navy">
                  {p(t.book.date)}
                </label>
                <input
                  type="date"
                  value={date}
                  min={todayHere()}
                  onChange={(e) => setDate(e.target.value)}
                  aria-invalid={dateInvalid || undefined}
                  className="mt-2 min-h-12 w-full rounded-2xl border-2 border-navy/30 bg-white px-4 font-semibold text-navy focus:border-flame focus:outline-none"
                />
                {dateInvalid && <p className="mt-1 text-sm font-semibold text-destructive">{p(t.book.datePast)}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    { v: "morning" as const, l: t.book.slotMorning },
                    { v: "afternoon" as const, l: t.book.slotAfternoon },
                    { v: "evening" as const, l: t.book.slotEvening },
                  ].map((s) => (
                    <button
                      key={s.v}
                      onClick={() => setSlot(s.v)}
                      className={`min-h-11 rounded-full border-2 px-5 py-2 text-sm font-bold transition-all ${
                        slot === s.v
                          ? "border-navy bg-navy text-paper"
                          : "border-navy/30 bg-white text-navy hover:border-navy"
                      }`}
                    >
                      {p(s.l)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="card-br p-5">
                <p className="font-display text-base font-extrabold text-navy">
                  {p(t.map.pinTitle)} <span className="text-flame-ink">*</span>
                </p>
                <div className="mt-3">
                  <LocationPicker value={pin} onChange={setPin} />
                </div>
              </div>

              <div className="card-br flex flex-col gap-4 p-5">
                {[
                  { l: t.book.area, v: area, set: setArea, ph: p(t.book.areaPh) },
                  { l: t.book.address, v: address, set: setAddress, ph: p(t.book.addressPh) },
                  { l: t.book.phone, v: contactPhone, set: setPhone, ph: p(t.book.phonePh), tel: true },
                ].map((f, i) => (
                  <div key={i}>
                    <label className="font-display text-base font-extrabold text-navy">
                      {p(f.l)}
                    </label>
                    <input
                      value={f.v}
                      onChange={(e) => f.set(e.target.value)}
                      placeholder={f.ph}
                      {...(f.tel && { type: "tel", autoComplete: "tel", dir: "ltr" })}
                      aria-invalid={f.tel && phoneInvalid ? true : undefined}
                      className="mt-2 min-h-12 w-full rounded-2xl border-2 border-navy/30 bg-white px-4 font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none"
                    />
                    {f.tel && phoneInvalid && (
                      <p className="mt-1 text-sm font-semibold text-destructive">{p(t.misc.phoneInvalid)}</p>
                    )}
                  </div>
                ))}
                <div>
                  <label className="font-display text-base font-extrabold text-navy">
                    {p(t.book.notes)}
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={p(t.book.notesPh)}
                    rows={3}
                    className="mt-2 w-full rounded-2xl border-2 border-navy/30 bg-white px-4 py-3 font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4 — review */}
          {step === 4 && cat && urgency && (
            <div className="flex flex-col gap-5">
              <h2 className="font-display text-xl font-extrabold text-navy">
                {p(t.book.reviewTitle)}
              </h2>
              <div className="card-br p-5">
                <div className="flex items-center gap-3">
                  <ServiceIcon id={cat.id} className="h-8 w-8 text-bird" />
                  <span className="font-display text-lg font-extrabold text-navy">
                    {p(cat.name)}
                  </span>
                </div>
                <dl className="mt-4 flex flex-col gap-2 text-sm">
                  {questions.map((q) => {
                    const opt = q.options?.find(
                      (o) => o.value === answers[q.id],
                    );
                    return (
                      <div key={q.id} className="flex justify-between gap-4">
                        <dt className="text-navy/70">{p(q.label)}</dt>
                        <dd className="text-end font-bold text-navy">
                          {opt ? p(opt.label) : answers[q.id]}
                        </dd>
                      </div>
                    );
                  })}
                  <div className="mt-2 border-t-2 border-navy/10 pt-3">
                    <div className="flex justify-between gap-4">
                      <dt className="text-navy/70">{p(t.book.date)}</dt>
                      <dd className="font-bold text-navy">
                        {date} · {p(
                          slot === "morning"
                            ? t.book.slotMorning
                            : slot === "afternoon"
                              ? t.book.slotAfternoon
                              : t.book.slotEvening,
                        )}
                      </dd>
                    </div>
                    <div className="mt-2 flex justify-between gap-4">
                      <dt className="text-navy/70">{p(t.book.area)}</dt>
                      <dd className="text-end font-bold text-navy">{area}</dd>
                    </div>
                    <div className="mt-2 flex justify-between gap-4">
                      <dt className="text-navy/70">{p(t.book.phone)}</dt>
                      <dd className="font-bold text-navy" dir="ltr">{contactPhone}</dd>
                    </div>
                  </div>
                </dl>
              </div>

              <div className="card-br border-flame p-5">
                <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/70">
                  {p(t.book.suggestedUrgency)}
                </p>
                <span
                  className={`mt-3 inline-block rounded-full border-2 px-5 py-2 font-display text-base font-extrabold ${URGENCY_BADGE[urgency.level]}`}
                >
                  {p(URGENCY_META[urgency.level].label)}
                </span>
                <p className="mt-2 text-sm text-navy/80">
                  {p(URGENCY_META[urgency.level].note)}
                </p>
                <p className="mt-3 text-xs leading-relaxed text-navy/70">
                  {p(t.book.urgencyDisclaimer)}
                </p>
              </div>

              {/* The visit fee, agreed before booking (contracts/workflow.ts). */}
              <div className="card-br flex items-start gap-3 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-flame/10 text-flame">
                  <ReceiptText className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-display text-sm font-extrabold text-navy">{p(t.book.visitFeeTitle)}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-navy/80">{p(t.book.visitFeeBody)}</p>
                </div>
              </div>

              {!authLoading && !isAuthenticated && (
                <div className="card-br border-flame p-5">
                  <h3 className="font-display text-lg font-extrabold text-navy">
                    {p(t.book.confirmTitle)}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-navy/70">
                    {p(t.book.confirmBody)}
                  </p>
                  <div className="mt-5">
                    <AuthPanel next="/book" initialMode="signup" headingLevel="h3" />
                  </div>
                </div>
              )}
              {isAuthenticated && user?.email && (
                <p className="text-sm text-navy/70">
                  {p(t.book.sendingAs)}{" "}
                  <span className="font-bold text-navy" dir="ltr">
                    {user.email}
                  </span>
                </p>
              )}
              {needsTerms && (
                <AgreeCheckbox id="book-agree" text={t.legal.agreeBooking} checked={agreedNow} onChange={setAgreedNow} />
              )}
            </div>
          )}
        </div>

        {/* nav buttons */}
        <div className="mt-10 flex items-center justify-between">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="btn-pill-outline disabled:opacity-30"
          >
            <ArrowLeft className="h-5 w-5 rtl:-scale-x-100" />
            {p(t.book.back)}
          </button>

          {step < 4 ? (
            <button
              onClick={() => {
                setSubmitError(null);
                setStep((s) => s + 1);
              }}
              disabled={
                (step === 0 && !category) ||
                (step === 1 && !questionsAnswered()) ||
                (step === 3 && !detailsReady)
              }
              className="btn-pill-primary disabled:opacity-40"
            >
              {p(t.book.next)}
              <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
            </button>
          ) : isAuthenticated ? (
            <button
              onClick={submit}
              disabled={submitting || (needsTerms && !agreedNow)}
              className="btn-pill-primary text-base disabled:opacity-40"
            >
              {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
              {uploadProgress
                ? `${p(t.book.uploadingPhotos)} ${uploadProgress.done + 1}/${uploadProgress.total}`
                : submitting
                  ? p(t.book.submitting)
                  : p(t.book.submit)}
            </button>
          ) : null}
        </div>
        {submitError && (
          <p className="mt-3 text-end text-sm font-semibold text-destructive">
            {submitError}
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
}
