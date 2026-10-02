import { useRef, useState } from "react";
import { ImagePlus, Loader2, ShieldCheck, X } from "lucide-react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { supabase } from "@/lib/supabase";
import { shrinkImage } from "@/lib/shrinkImage";
import { isNetworkError, isRateLimited, refusalMessage } from "@/lib/errors";
import { WORKMANSHIP_GUARANTEE_DAYS } from "@contracts/legal";
import { isValidVisitDate, MAX_BOOKING_VIDEOS, MAX_PROBLEM_FILES, TIME_SLOTS, todayInBeirut, type TimeSlot } from "@contracts/workflow";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const FIELD =
  "mt-2 w-full rounded-2xl border-2 border-navy/30 bg-white px-4 font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none";

/**
 * The workmanship guarantee on a completed job: how long it's covered, and a form to
 * report that something isn't right (which opens a linked return visit).
 */
export function ReportProblem({
  requestId,
  guarantee,
  onReported,
}: {
  requestId: number;
  guarantee: { endsAt: Date | null; openClaimId: number | null };
  onReported: (claimId: number) => void;
}) {
  const { t, p, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState<TimeSlot | "">("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const createUpload = trpc.storage.createUpload.useMutation();
  const report = trpc.requests.reportProblem.useMutation();

  if (sentId !== null) {
    return <Box>{p(t.requests.reportSent).replace("{id}", String(sentId))}</Box>;
  }
  if (guarantee.openClaimId) {
    return <Box>{p(t.requests.claimOpen).replace("{id}", String(guarantee.openClaimId))}</Box>;
  }
  const endsAt = guarantee.endsAt ? new Date(guarantee.endsAt) : null;
  // eslint-disable-next-line react-hooks/purity -- compared once per render; a stale minute doesn't matter
  if (!endsAt || endsAt.getTime() < Date.now()) return null;

  const until = endsAt.toLocaleDateString(lang === "ar" ? "ar-LB" : "en-GB", { day: "numeric", month: "long" });
  const descriptionOk = description.trim().length >= 10;
  const dateOk = !!date && isValidVisitDate(date, todayInBeirut());
  const slots: Record<TimeSlot, { en: string; ar: string }> = {
    morning: t.book.slotMorning,
    afternoon: t.book.slotAfternoon,
    evening: t.book.slotEvening,
  };

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list).slice(0, MAX_PROBLEM_FILES - files.length);
    if (fileRef.current) fileRef.current.value = "";
    setPreparing(true);
    let videos = files.filter((f) => f.type.startsWith("video/")).length;
    const accepted: File[] = [];
    for (const original of picked) {
      if (original.type.startsWith("video/") && ++videos > MAX_BOOKING_VIDEOS) continue;
      const file = await shrinkImage(original);
      if (file.size <= MAX_FILE_BYTES && /^(image|video)\//.test(file.type)) accepted.push(file);
    }
    setFiles((f) => [...f, ...accepted]);
    setPreparing(false);
  }

  async function send() {
    if (!descriptionOk || !dateOk || !slot) return;
    setSending(true);
    setError(null);
    let uploading = false;
    try {
      const media = [];
      for (const file of files) {
        uploading = true;
        const contentType = file.type || "application/octet-stream";
        const target = await createUpload.mutateAsync({ fileName: file.name, size: file.size, contentType });
        const { error: uploadError } = await supabase.storage
          .from(target.bucket)
          .uploadToSignedUrl(target.key, target.token, file, { contentType });
        if (uploadError) throw uploadError;
        media.push({ key: target.key, fileName: file.name, size: file.size, contentType });
      }
      uploading = false;
      const { id } = await report.mutateAsync({
        id: requestId,
        description: description.trim(),
        preferredDate: date,
        timeSlot: slot,
        media,
      });
      setSentId(id);
      onReported(id);
    } catch (err) {
      const reason = refusalMessage(err);
      setError(
        isRateLimited(err)
          ? p(t.misc.tooMany)
          : isNetworkError(err)
            ? p(t.misc.offline)
            : uploading
              ? p(t.book.photoUploadFailed)
              : (reason ?? p(t.misc.error)),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border-2 border-bird bg-bird/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-navy">
        <ShieldCheck className="h-5 w-5 shrink-0 text-bird" />
        {p(t.requests.coveredUntil)
          .replace("{days}", String(WORKMANSHIP_GUARANTEE_DAYS))
          .replace("{date}", until)}
      </p>

      {!open ? (
        <button onClick={() => setOpen(true)} className="btn-pill-outline mt-3">
          {p(t.requests.reportProblem)}
        </button>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <label htmlFor={`problem-${requestId}`} className="font-display text-base font-extrabold text-navy">
              {p(t.requests.reportTitle)}
            </label>
            <p className="mt-1 text-xs text-navy/70">{p(t.requests.reportHint)}</p>
            <textarea
              id={`problem-${requestId}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={p(t.requests.reportPh)}
              maxLength={2000}
              rows={3}
              className={`${FIELD} py-3`}
            />
            {description.trim() !== "" && !descriptionOk && (
              <p className="mt-1 text-sm font-semibold text-destructive">{p(t.requests.reportTooShort)}</p>
            )}
          </div>

          <div>
            <p className="font-display text-sm font-extrabold text-navy">{p(t.requests.reportPhotos)}</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {files.map((file, i) => (
                <span key={i} className="inline-flex max-w-48 items-center gap-1 rounded-full border-2 border-navy/20 bg-white px-3 py-1 text-xs font-semibold text-navy">
                  <span className="truncate">{file.name}</span>
                  <button
                    onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}
                    aria-label={`${p(t.dash2.remove)} ${file.name}`}
                    className="text-navy/60 hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              {files.length < MAX_PROBLEM_FILES && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={preparing}
                  className="btn-pill-outline !min-h-10 !px-4 !py-1.5 text-xs"
                >
                  {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  {p(t.book.addPhotos)}
                </button>
              )}
            </div>
          </div>

          <div>
            <label htmlFor={`problem-date-${requestId}`} className="font-display text-sm font-extrabold text-navy">
              {p(t.requests.reportWhen)}
            </label>
            <input
              id={`problem-date-${requestId}`}
              type="date"
              value={date}
              min={todayInBeirut()}
              onChange={(e) => setDate(e.target.value)}
              className={`${FIELD} min-h-12`}
            />
            {date && !dateOk && <p className="mt-1 text-sm font-semibold text-destructive">{p(t.book.datePast)}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {TIME_SLOTS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSlot(s)}
                  aria-pressed={slot === s}
                  className={`min-h-11 rounded-full border-2 px-4 text-sm font-bold ${
                    slot === s ? "border-navy bg-navy text-paper" : "border-navy/30 bg-white text-navy hover:border-navy"
                  }`}
                >
                  {p(slots[s])}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={send}
            disabled={sending || preparing || !descriptionOk || !dateOk || !slot}
            className="btn-pill-primary self-start disabled:opacity-40"
          >
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            {p(t.requests.reportSend)}
          </button>
          {error && (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 flex items-center gap-2 rounded-2xl border-2 border-bird bg-bird/5 p-4 text-sm font-semibold text-navy">
      <ShieldCheck className="h-5 w-5 shrink-0 text-bird" />
      {children}
    </p>
  );
}
