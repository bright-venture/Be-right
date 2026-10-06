import { X } from "lucide-react";
import { trpc } from "@/providers/trpc";

type MediaItem = { key: string; contentType: string | null };

/** Photos/videos attached to a request, loaded through short-lived signed URLs. */
export function MediaGrid({
  items,
  className = "grid grid-cols-3 gap-2 sm:grid-cols-4",
  onRemove,
  removeLabel,
}: {
  items: MediaItem[];
  className?: string;
  /** Shows a remove button on each tile (the technician's own job photos). */
  onRemove?: (key: string) => void;
  removeLabel?: string;
}) {
  const keys = items.map((m) => m.key);
  const { data } = trpc.storage.urls.useQuery({ keys }, { enabled: keys.length > 0 });
  if (!items.length) return null;
  const tile = "aspect-square w-full rounded-2xl border-2 border-navy object-cover";
  return (
    <div className={className}>
      {items.map((m) => {
        const url = data?.urls?.[m.key];
        const content = !url ? (
          <div className="aspect-square w-full animate-pulse rounded-2xl border-2 border-navy/20 bg-navy/5" />
        ) : m.contentType?.startsWith("video/") ? (
          <video src={url} controls playsInline preload="metadata" className={tile} />
        ) : (
          <a href={url} target="_blank" rel="noreferrer">
            <img src={url} alt="" className={tile} />
          </a>
        );
        return (
          <div key={m.key} className="relative">
            {content}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(m.key)}
                aria-label={removeLabel}
                title={removeLabel}
                className="absolute -end-1.5 -top-1.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-navy bg-white text-navy shadow hover:bg-navy hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
