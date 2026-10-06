import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { MediaGrid } from "@/components/MediaGrid";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { supabase } from "@/lib/supabase";
import { shrinkImage } from "@/lib/shrinkImage";
import { isRateLimited } from "@/lib/errors";
import { MAX_JOB_PHOTOS, type JobPhotoKind } from "@contracts/workflow";

type Media = { key: string; contentType: string | null; kind: string };

const LABEL = "font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/70";

/** Read-only before/after photos of a job, for the customer and the specialist. Nothing until there are some. */
export function BeforeAfter({ media, forCustomer = false }: { media: Media[]; forCustomer?: boolean }) {
  const { t, p } = useI18n();
  const sides = (["before", "after"] as const)
    .map((kind) => ({ kind, items: media.filter((m) => m.kind === kind) }))
    .filter((s) => s.items.length > 0);
  if (!sides.length) return null;
  return (
    <div>
      <p className={LABEL}>{p(t.jobPhotos.title)}</p>
      {forCustomer && <p className="mt-1 text-xs text-navy/70">{p(t.jobPhotos.customerNote)}</p>}
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        {sides.map(({ kind, items }) => (
          <div key={kind} className="min-w-0">
            <p className="text-xs font-bold text-navy">{p(t.jobPhotos[kind])}</p>
            <MediaGrid items={items} className="mt-1.5 grid grid-cols-3 gap-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Technician: the before or after photos of one job. Photos are shrunk on the phone,
 * uploaded straight to private storage, then attached to the job in one go.
 */
export function JobPhotoUpload({
  requestId,
  kind,
  media,
  locked = false,
}: {
  requestId: number;
  kind: JobPhotoKind;
  media: Media[];
  /** After photos wait until the work has started. */
  locked?: boolean;
}) {
  const { t, p } = useI18n();
  const utils = trpc.useUtils();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createUpload = trpc.storage.createJobUpload.useMutation();
  const attach = trpc.tech.addJobPhotos.useMutation();
  const remove = trpc.tech.removeJobPhoto.useMutation({ onSuccess: () => utils.tech.myJobs.invalidate() });

  const items = media.filter((m) => m.kind === kind);
  const room = MAX_JOB_PHOTOS - items.length;
  const fill = (s: string) => s.replace("{n}", String(items.length)).replace("{max}", String(MAX_JOB_PHOTOS));

  async function onPick(files: FileList | null) {
    const picked = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (input.current) input.current.value = "";
    if (!picked.length) return;
    setError(picked.length > room ? fill(p(t.jobPhotos.tooMany)) : null);
    setBusy(true);
    try {
      const photos = [];
      for (const original of picked.slice(0, room)) {
        const file = await shrinkImage(original, { maxSide: 1600, quality: 0.8 });
        const contentType = file.type || "image/jpeg";
        const target = await createUpload.mutateAsync({ requestId, fileName: file.name, size: file.size, contentType });
        const { error: uploadError } = await supabase.storage
          .from(target.bucket)
          .uploadToSignedUrl(target.key, target.token, file, { contentType });
        if (uploadError) throw uploadError;
        photos.push({ key: target.key, fileName: file.name, size: file.size, contentType });
      }
      if (photos.length) await attach.mutateAsync({ requestId, kind, photos });
    } catch (err) {
      setError(p(isRateLimited(err) ? t.misc.tooMany : t.jobPhotos.uploadFailed));
    } finally {
      setBusy(false);
      await utils.tech.myJobs.invalidate();
    }
  }

  return (
    <div className={`rounded-2xl border-2 p-4 ${locked ? "border-dashed border-navy/20" : "border-navy/15 bg-white"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className={LABEL}>{p(t.jobPhotos[kind])}</p>
        <span className="text-xs font-bold tabular-nums text-navy/70">{fill(p(t.jobPhotos.count))}</span>
      </div>
      <p className="mt-1 text-xs text-navy/70">
        {locked ? p(t.jobPhotos.afterLocked) : p(kind === "before" ? t.jobPhotos.beforeHint : t.jobPhotos.afterHint)}
      </p>
      <MediaGrid
        items={items}
        className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4"
        onRemove={locked ? undefined : (key) => remove.mutate({ requestId, key })}
        removeLabel={p(t.jobPhotos.remove)}
      />
      {!locked && room > 0 && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-label={`${p(t.jobPhotos[kind])}: ${p(t.jobPhotos.add)}`}
            onChange={(e) => onPick(e.target.files)}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="btn-pill-outline mt-3 w-full justify-center !min-h-11 text-sm sm:w-auto"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {p(t.jobPhotos.add)}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
