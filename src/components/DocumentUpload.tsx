import { useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { supabase } from "@/lib/supabase";
import { isRateLimited } from "@/lib/errors";
import { shrinkImage } from "@/lib/shrinkImage";
import {
  DOCUMENT_TYPES,
  isAllowedDocumentType,
  MAX_DOCUMENT_BYTES,
  type ApplicationDocument,
} from "@contracts/applications";

/**
 * One required applicant document (ID, criminal record, proof of address or photo). Uploads straight
 * to private storage when picked and reports the stored key to the form.
 */
export function DocumentUpload({
  kind,
  label,
  hint,
  onUploaded,
}: {
  kind: ApplicationDocument;
  label: string;
  hint: string;
  onUploaded: (key: string | null) => void;
}) {
  const { t, p } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createUpload = trpc.storage.createDocumentUpload.useMutation();
  const accept = DOCUMENT_TYPES[kind].join(",");

  async function onPick(picked: File | undefined) {
    if (!picked) return;
    setError(null);
    if (!isAllowedDocumentType(kind, picked.type || "application/octet-stream")) {
      setError(p(kind === "photo" ? t.docs.badPhoto : t.docs.badFile));
      return;
    }
    setBusy(true);
    onUploaded(null);
    // Photos are shrunk first (scanned documents stay sharp enough to read); PDFs go as they are.
    const file = await shrinkImage(picked, kind === "photo" ? { maxSide: 1024 } : { maxSide: 2000, quality: 0.85 });
    const contentType = file.type || "application/octet-stream";
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError(p(kind === "photo" ? t.docs.badPhoto : t.docs.badFile));
      setBusy(false);
      return;
    }
    try {
      const target = await createUpload.mutateAsync({ kind, fileName: file.name, size: file.size, contentType });
      const { error: uploadError } = await supabase.storage
        .from(target.bucket)
        .uploadToSignedUrl(target.key, target.token, file, { contentType });
      if (uploadError) throw uploadError;
      setFileName(file.name);
      onUploaded(target.key);
    } catch (err) {
      setFileName(null);
      setError(p(isRateLimited(err) ? t.misc.tooMany : t.docs.uploadFailed));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="rounded-2xl border-2 border-navy/20 bg-white p-4">
      {/* Phones: text full width, button underneath; wider screens: side by side. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-extrabold text-navy">
            {label} <span className="text-flame-ink">*</span>
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-navy/70">{hint}</p>
          <p className="mt-0.5 text-xs font-semibold text-navy/60">{p(t.docs.maxSize)}</p>
        </div>
        <input
          ref={input}
          type="file"
          accept={accept}
          className="hidden"
          aria-label={label}
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="btn-pill-outline !min-h-11 w-full justify-center !px-4 !py-1.5 text-xs sm:w-auto"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          {fileName ? p(t.docs.replace) : p(t.docs.choose)}
        </button>
      </div>
      {fileName && !busy && (
        <p className="mt-2 flex items-center gap-1.5 truncate text-xs font-semibold text-navy">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-700" /> {fileName}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
