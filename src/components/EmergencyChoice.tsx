import { Link } from "react-router";
import { ArrowRight, CalendarCheck, Siren } from "lucide-react";
import { useI18n } from "@/i18n";

const CARD =
  "group flex min-h-[132px] flex-col justify-between gap-3 rounded-[24px] border-2 p-4 text-start transition-all hover:-translate-y-1 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-navy active:translate-y-0 sm:p-5";

/**
 * The two ways in, side by side: an emergency (pick what's wrong, then call the team)
 * or a normal booking online. Used at the top of the home page and the app's home screen.
 */
export function EmergencyChoice({ bookHref, className = "" }: { bookHref: string; className?: string }) {
  const { t, p } = useI18n();
  return (
    <section className={className} aria-labelledby="emergency-choice">
      <h2 id="emergency-choice" className="font-display text-base font-extrabold text-navy">
        {p(t.emergency.choiceQ)}
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Link
          to="/emergency"
          className={`${CARD} border-flame bg-flame text-white shadow-[0_6px_0_#081E42] hover:shadow-[0_9px_0_#081E42]`}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <Siren className="h-5 w-5" />
          </span>
          <span>
            <span className="flex items-center gap-1.5 font-display text-base font-black leading-tight sm:text-lg">
              {p(t.emergency.yesTitle)}
              <ArrowRight className="h-4 w-4 shrink-0 rtl:-scale-x-100" />
            </span>
            <span className="mt-1 block text-xs leading-snug text-white/90 sm:text-sm">{p(t.emergency.yesSub)}</span>
          </span>
        </Link>
        <Link
          to={bookHref}
          className={`${CARD} border-navy bg-white text-navy shadow-[0_6px_0_rgb(12_43_92/0.9)] hover:shadow-[0_9px_0_rgb(12_43_92/0.9)]`}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy/10 text-navy">
            <CalendarCheck className="h-5 w-5" />
          </span>
          <span>
            <span className="flex items-center gap-1.5 font-display text-base font-black leading-tight sm:text-lg">
              {p(t.emergency.noTitle)}
              <ArrowRight className="h-4 w-4 shrink-0 rtl:-scale-x-100" />
            </span>
            <span className="mt-1 block text-xs leading-snug text-navy/70 sm:text-sm">{p(t.emergency.noSub)}</span>
          </span>
        </Link>
      </div>
    </section>
  );
}
