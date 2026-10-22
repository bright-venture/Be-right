import { MapPin, Star } from "lucide-react";
import JobMap from "@/components/map/JobMap";
import { Stars } from "@/components/Stars";
import { useI18n } from "@/i18n";
import { isRecent } from "@/lib/time";
import type { RequestStatus } from "@contracts/services";

// Pieces shared by the website requests page (src/pages/Requests.tsx) and the app's
// request screens (src/pages/AppRequests.tsx).

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

export function StatusBadge({ status }: { status: RequestStatus }) {
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

export function TechnicianCard({
  name,
  photoUrl,
  rating,
  home,
  location,
  arrived = false,
}: {
  name: string | null;
  photoUrl: string | null;
  rating: { average: number | null; count: number };
  home: { lat: number; lng: number } | null;
  location: { lat: string; lng: string; updatedAt: Date } | null;
  /** The technician pressed Arrived (or started): no more map following. */
  arrived?: boolean;
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
      </div>
      {arrived ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-green-700/10 px-3 py-2 text-sm font-bold text-green-800">
          <MapPin className="h-4 w-4" /> {p(t.tracking.arrived)}
        </p>
      ) : (home || live) && (
        <div className="mt-3">
          <JobMap home={home} technician={live} technicianLabel={initials(name)} />
        </div>
      )}
      {arrived ? null : live ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-navy/70">
            {fresh ? `${p(t.tracking.lastUpdate)}: ${time}` : p(t.tracking.lastSeen).replace("{time}", time)}
          </p>
          {fresh && (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-bird px-3 py-1 text-xs font-bold text-white">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              {p(t.tracking.onTheWay)}
            </span>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-navy/70">{p(t.tracking.noLocationYet)}</p>
      )}
    </div>
  );
}
