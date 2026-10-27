import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { usePush } from "@/hooks/usePush";
import { trpc } from "@/providers/trpc";
import { openLocationSettings as openAppSettings } from "@/lib/presence";
import { listenToPush, pushAskedLater, pushAvailable, pushLater, turnOnPush } from "@/lib/push";

/**
 * Mounted once for the whole app: opens the page of a tapped notification, refreshes the
 * screen when one arrives with the app open, and keeps this phone linked to whoever is signed
 * in (and to the app's language) when notifications are already allowed.
 */
export function PushKeeper() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const { status, save } = usePush();

  useEffect(() => {
    let stop = () => {};
    void listenToPush({ open: (path) => navigate(path), arrived: () => void utils.invalidate() }).then((s) => (stop = s));
    return () => stop();
  }, [navigate, utils]);

  // Signed in with notifications allowed: (re)register this phone for them, in the app's language.
  useEffect(() => {
    if (user && status === "on") void turnOnPush(save).catch(() => {});
  }, [user, status, save]);

  return null;
}

/**
 * The invitation to turn notifications on, at the moment it makes sense: a customer with a
 * request, a professional on their jobs, a specialist on their dashboard. Shown until they
 * answer it; "Not now" hides it (My account can still turn them on).
 */
export function PushPrompt({ show = true }: { show?: boolean }) {
  const { t, p } = useI18n();
  const { user } = useAuth();
  const { status, busy, turnOn } = usePush();
  const [hidden, setHidden] = useState(pushAskedLater);
  if (!pushAvailable || !show || hidden || status !== "ask" || !user) return null;
  const text =
    user.role === "technician" ? t.push.promptTech : user.role === "customer" ? t.push.promptCustomer : t.push.promptStaff;

  return (
    <section className="mt-4 flex flex-col gap-3 rounded-3xl border-2 border-bird/30 bg-bird/[0.05] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-bird text-white">
          <Bell className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-base font-black text-navy">{p(text.title)}</p>
          <p className="mt-0.5 text-sm text-navy/70">{p(text.body)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            pushLater();
            setHidden(true);
          }}
          className="min-h-11 rounded-full border-2 border-navy/15 bg-white text-sm font-bold text-navy"
        >
          {p(t.push.later)}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void turnOn()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-bird text-sm font-bold text-white disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {p(t.push.turnOn)}
        </button>
      </div>
    </section>
  );
}

/** My account (app): notifications on this phone, on or off. */
export function PushSetting({ className = "" }: { className?: string }) {
  const { t, p } = useI18n();
  const { status, busy, turnOn, turnOff } = usePush();
  if (!pushAvailable || status === null || status === "unavailable") return null;
  const on = status === "on";

  return (
    <div className={`rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgb(12_43_92/0.06)] ${className}`}>
      <div className="flex items-center gap-3">
        {on ? <Bell className="h-5 w-5 shrink-0 text-bird" /> : <BellOff className="h-5 w-5 shrink-0 text-navy/40" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-navy">{p(t.push.setting)}</p>
          <p className="text-xs text-navy/60">{p(status === "blocked" ? t.push.blocked : on ? t.push.onHint : t.push.offHint)}</p>
        </div>
        {status === "blocked" ? (
          <button type="button" onClick={openAppSettings} className="text-sm font-bold text-navy underline underline-offset-4">
            {p(t.push.openSettings)}
          </button>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={p(t.push.setting)}
            disabled={busy}
            onClick={() => void (on ? turnOff() : turnOn())}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-green-700" : "bg-navy/25"}`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "start-[22px]" : "start-0.5"}`}
            />
          </button>
        )}
      </div>
    </div>
  );
}
