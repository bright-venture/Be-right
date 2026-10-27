import { useEffect } from "react";
import { Loader2, MapPinOff, Power } from "lucide-react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useTrackingNotice } from "@/hooks/useTrackingNotice";
import { trpc } from "@/providers/trpc";
import { isNativeApp } from "@/lib/native";
import { goOffline, goOnline, openLocationSettings, resumeOnline, usePresence } from "@/lib/presence";

/**
 * The top of My jobs, like a ride app's "Go online": Available or offline. Going online needs
 * location; while Available the team gets the technician's position. Offline, none is kept.
 */
export function Availability() {
  const { t, p } = useI18n();
  const notice = useTrackingNotice();
  const utils = trpc.useUtils();
  const presence = usePresence();
  const busy = presence.starting;

  async function toggle() {
    if (presence.online) await goOffline();
    else await goOnline(notice);
    void utils.tech.presence.invalidate();
  }

  return (
    <section
      className={`mt-6 rounded-3xl border-2 p-5 transition-colors ${
        presence.online ? "border-green-700 bg-green-700/[0.06]" : "border-navy/15 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center gap-4">
        <span className="relative flex h-3.5 w-3.5 shrink-0">
          {presence.online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-600 opacity-60" />}
          <span className={`relative inline-flex h-3.5 w-3.5 rounded-full ${presence.online ? "bg-green-600" : "bg-navy/25"}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-black text-navy">{p(presence.online ? t.tech.availOn : t.tech.availOff)}</p>
          <p className="mt-0.5 text-sm text-navy/70">
            {p(presence.online ? (isNativeApp ? t.tech.availOnHint : t.tech.availOnHintWeb) : t.tech.availOffHint)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-bold sm:w-auto ${
            presence.online ? "border-2 border-navy/25 bg-white text-navy" : "bg-green-700 text-white"
          } disabled:opacity-60`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
          {busy ? p(t.tech.goingOnline) : p(presence.online ? t.tech.goOffline : t.tech.goOnline)}
        </button>
      </div>
      {presence.problem && !presence.online && (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-red-700/[0.07] px-4 py-3">
          <MapPinOff className="h-4 w-4 shrink-0 text-red-700" />
          <p className="min-w-0 flex-1 text-sm font-semibold text-red-700">
            {p(presence.problem === "denied" ? t.tech.locDenied : t.tech.locUnavailable)}
          </p>
          {presence.problem === "denied" && isNativeApp && (
            <button type="button" onClick={openLocationSettings} className="text-sm font-bold text-navy underline underline-offset-4">
              {p(t.tech.openSettings)}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Picks location back up when a technician who is still Available opens the app again (the
 * phone or the browser stopped it). Mounted once, for the whole app.
 */
export function PresenceKeeper() {
  const { user } = useAuth();
  const notice = useTrackingNotice();
  const isTech = user?.role === "technician";
  const server = trpc.tech.presence.useQuery(undefined, { enabled: isTech, staleTime: 60_000 });
  const stillOnline = isTech && !!server.data?.online;
  useEffect(() => {
    if (stillOnline) void resumeOnline(notice);
    // the notice text only matters when tracking starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stillOnline]);
  return null;
}
