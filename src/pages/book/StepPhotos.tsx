import { ImagePlus, Loader2, X } from "lucide-react";
import { useI18n } from "@/i18n";
import { MAX_BOOKING_FILES } from "@contracts/workflow";
import { MEDIA_ACCEPT } from "@contracts/uploads";
import type { BookingForm } from "./useBookingForm";

/** Step 3: photos and videos (optional). */
export function StepPhotos({ form }: { form: BookingForm }) {
  const { t, p } = useI18n();
  const { media, setMedia, uploadError, preparingFiles, fileRef, onFiles } = form;
  return (
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
  );
}
