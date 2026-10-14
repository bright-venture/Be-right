import { useState } from "react";
import { AlertTriangle, Phone, PhoneCall } from "lucide-react";
import { useI18n } from "@/i18n";
import { telLink } from "@/lib/contact";
import { COMPANY } from "@contracts/legal";

/**
 * The emergency line: the customer calls, and the specialist who answers takes the details
 * and sends a technician (dashboard, Emergencies). Nothing is collected on the site.
 * `tone="onFlame"` is for the app's orange Emergency box.
 */
export function EmergencyLine({ tone = "plain" }: { tone?: "plain" | "onFlame" }) {
  const { t, p } = useI18n();
  const line = COMPANY.emergencyPhone.trim();
  // On a computer the Call button can't dial: say to call from a phone instead.
  const [onComputer] = useState(() => !window.matchMedia("(pointer: coarse)").matches);
  const onFlame = tone === "onFlame";

  if (!line) {
    return (
      <p className={`rounded-2xl border border-dashed p-4 text-sm font-semibold ${onFlame ? "border-white/40 text-white/90" : "border-navy/25 text-navy/60"}`}>
        {p(t.emergency.lineSoon)}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <a
        href={telLink(line)}
        className={`flex items-center gap-3 rounded-2xl p-3.5 transition-colors ${onFlame ? "bg-white/15 hover:bg-white/20" : "bg-flame/[0.07] hover:bg-flame/10"}`}
      >
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${onFlame ? "bg-white text-flame" : "bg-flame text-white"}`}>
          <PhoneCall className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className={`block text-[11px] font-bold uppercase tracking-[0.12em] ${onFlame ? "text-white/80" : "text-navy/55"}`}>
            {p(t.emergency.lineLabel)}
          </span>
          <span dir="ltr" className={`block font-display text-2xl font-black tracking-tight ${onFlame ? "text-white" : "text-navy"}`}>
            {line}
          </span>
        </span>
      </a>
      <a
        href={telLink(line)}
        className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full font-display text-base font-black transition-transform active:scale-[0.98] ${
          onFlame ? "bg-white text-flame" : "bg-flame text-white shadow-[0_3px_0_#081E42]"
        }`}
      >
        <Phone className="h-5 w-5" />
        {p(t.emergency.callNow)}
      </a>
      {onComputer && (
        <p className={`text-center text-xs font-semibold ${onFlame ? "text-white/85" : "text-navy/60"}`}>{p(t.emergency.computerHint)}</p>
      )}
      <p className={`flex items-start gap-2 text-xs leading-snug ${onFlame ? "text-white/90" : "text-navy/70"}`}>
        <AlertTriangle className={`mt-px h-4 w-4 shrink-0 ${onFlame ? "text-white" : "text-red-700"}`} />
        {p(t.emergency.danger)}
      </p>
    </div>
  );
}
