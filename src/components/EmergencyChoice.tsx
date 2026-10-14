import { Link } from "react-router";
import { ArrowRight, CalendarCheck, Siren, type LucideIcon } from "lucide-react";
import { useI18n } from "@/i18n";
import type { LocalText } from "@contracts/services";

type Tone = "emergency" | "booking";

const TONES: Record<Tone, { card: string; icon: string; sub: string; action: string; arrow: string }> = {
  emergency: {
    card: "border-flame bg-gradient-to-br from-[#FF6A1F] to-flame text-white shadow-[0_4px_0_#081E42] hover:shadow-[0_7px_0_#081E42]",
    icon: "bg-white/20 text-white",
    sub: "text-white/85",
    action: "border-white/25 text-white",
    arrow: "bg-white text-flame",
  },
  booking: {
    card: "border-navy bg-white text-navy shadow-[0_4px_0_rgb(12_43_92/0.9)] hover:shadow-[0_7px_0_rgb(12_43_92/0.9)]",
    icon: "bg-navy/[0.07] text-navy",
    sub: "text-navy/65",
    action: "border-navy/10 text-navy",
    arrow: "bg-navy text-white",
  },
};

/**
 * One way in. Both cards share the same layout (icon, title, description, then the action
 * at the bottom), so their lines sit level even when one description runs longer.
 */
function ChoiceCard({
  to,
  tone,
  icon: Icon,
  title,
  sub,
  action,
}: {
  to: string;
  tone: Tone;
  icon: LucideIcon;
  title: LocalText;
  sub: LocalText;
  action: LocalText;
}) {
  const { p } = useI18n();
  const style = TONES[tone];
  return (
    <Link
      to={to}
      className={`group flex h-full flex-col rounded-[24px] border-2 p-4 text-start transition-all duration-200 hover:-translate-y-1 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-navy active:translate-y-0 sm:p-5 ${style.card}`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${style.icon}`}>
        <Icon className="h-[22px] w-[22px]" />
      </span>
      {/* Room for two lines on phones, where one title wraps: the descriptions start level. */}
      <span className="mt-4 min-h-[2.5em] font-display text-lg font-black leading-tight sm:min-h-0 sm:text-xl">{p(title)}</span>
      <span className={`mb-4 mt-1.5 text-[13px] leading-snug sm:mb-5 sm:text-sm ${style.sub}`}>{p(sub)}</span>
      <span className={`mt-auto flex items-center justify-between gap-2 border-t pt-3 font-display text-sm font-extrabold ${style.action}`}>
        {p(action)}
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 ${style.arrow}`}
        >
          <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
        </span>
      </span>
    </Link>
  );
}

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
      <div className="mt-3 grid auto-rows-fr grid-cols-2 gap-3 sm:gap-4">
        <ChoiceCard
          to="/emergency"
          tone="emergency"
          icon={Siren}
          title={t.emergency.yesTitle}
          sub={t.emergency.yesSub}
          action={t.emergency.yesAction}
        />
        <ChoiceCard
          to={bookHref}
          tone="booking"
          icon={CalendarCheck}
          title={t.emergency.noTitle}
          sub={t.emergency.noSub}
          action={t.emergency.noAction}
        />
      </div>
    </section>
  );
}
