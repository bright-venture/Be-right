import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, Loader2, Send, ShieldAlert, Siren, X } from "lucide-react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { isNetworkError, isRateLimited } from "@/lib/errors";
import LocationPicker, { type Pin } from "@/components/map/LocationPicker";
import { EmergencyLine } from "@/components/EmergencyLine";
import { EMERGENCY_PROBLEM_MAP, LEAVE_FIRST } from "@contracts/emergency";
import { DEFAULT_PHONE_COUNTRY, isValidLocalPhone, joinPhone, type PhoneCountry } from "@contracts/phone";
import { PhoneInput } from "@/components/PhoneInput";

/** What to do now for this emergency: leave first if in danger, then its own steps in order. */
function SafetySteps({ problem, title }: { problem: string; title: string }) {
  const { p } = useI18n();
  const steps = EMERGENCY_PROBLEM_MAP[problem]?.safety ?? [];
  return (
    <section className="rounded-2xl border-2 border-red-700/25 bg-red-700/[0.04] p-4">
      <h3 className="flex items-center gap-2 font-display text-base font-extrabold text-navy">
        <ShieldAlert className="h-5 w-5 text-red-700" /> {title}
      </h3>
      <p className="mt-2 rounded-xl bg-red-700 px-3 py-2 text-sm font-bold text-white">{p(LEAVE_FIRST)}</p>
      <ol className="mt-3 flex flex-col gap-2.5">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm leading-snug text-navy">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                step.critical ? "bg-red-700 text-white" : "bg-navy/10 text-navy"
              }`}
            >
              {i + 1}
            </span>
            <span className={step.critical ? "font-bold" : ""}>{p(step.text)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Priority dispatch, after picking the emergency: what to do now to stay safe, a few quick
 * questions (optional), where you are and your phone, Send details, then the emergency line to
 * call. The specialist who answers sees it all and adds the rest on the phone. The number shows
 * once the details are sent (or if sending fails, so a call is still possible), with the safety
 * steps kept in view while waiting.
 */
export function EmergencyDialog({ problem, onClose }: { problem: string; onClose: () => void }) {
  const { t, p } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pin, setPin] = useState<Pin | null>(null);
  const [country, setCountry] = useState<PhoneCountry>(DEFAULT_PHONE_COUNTRY);
  const [local, setLocal] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const phone = joinPhone(country, local);
  const phoneOk = isValidLocalPhone(country, local);
  const report = trpc.emergency.report.useMutation();
  const info = EMERGENCY_PROBLEM_MAP[problem];
  const label = info?.label;
  // Optional, one tap each (tap again to clear): speed comes first in an emergency.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answer = (id: string, value: string) =>
    setAnswers((a) => {
      const next = { ...a };
      if (next[id] === value) delete next[id];
      else next[id] = value;
      return next;
    });
  const showLine = report.isSuccess || report.isError;

  // Escape closes; the page behind doesn't scroll.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("button, input")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const send = () => {
    if (!pin || !phoneOk || report.isPending) return;
    report.mutate({ problem, lat: pin.lat, lng: pin.lng, phone, answers });
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={p(t.emergency.dispatchTitle)}>
      <button aria-label={p(t.emergency.close)} className="absolute inset-0 cursor-default bg-navy/45 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[24px] border-2 border-navy bg-white p-5 shadow-[0_10px_0_rgb(12_43_92/0.3)] sm:rounded-[24px] sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-flame text-white">
            <Siren className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[11px] font-black uppercase tracking-[0.18em] text-flame">{p(t.emergency.dispatchTitle)}</p>
            <h2 className="font-display text-xl font-black text-navy">{label ? p(label) : problem}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={p(t.emergency.close)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-navy/15 text-navy hover:bg-navy/5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {showLine ? (
          <div className="mt-5 flex flex-col gap-4">
            {report.isSuccess && (
              <p role="status" className="flex items-start gap-2.5 rounded-2xl border border-green-700/25 bg-green-700/[0.06] p-3.5 text-sm font-bold text-navy">
                <CircleCheck className="mt-px h-5 w-5 shrink-0 text-green-700" />
                {p(t.emergency.sentNowCall)}
              </p>
            )}
            {report.isError && (
              <p role="alert" className="text-sm font-bold text-red-700">
                {p(isRateLimited(report.error) ? t.misc.tooMany : isNetworkError(report.error) ? t.misc.offline : t.misc.error)}{" "}
                {p(t.emergency.callAnyway)}
              </p>
            )}
            <EmergencyLine />
            <SafetySteps problem={problem} title={p(t.emergency.whileYouWait)} />
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            <SafetySteps problem={problem} title={p(t.emergency.safetyTitle)} />

            {info && info.questions.length > 0 && (
              <section>
                <h3 className="font-display text-base font-extrabold text-navy">{p(t.emergency.questionsTitle)}</h3>
                <p className="mt-0.5 text-sm text-navy/65">{p(t.emergency.questionsHint)}</p>
                <div className="mt-3 flex flex-col gap-3">
                  {info.questions.map((q) => (
                    <div key={q.id} role="radiogroup" aria-label={p(q.label)}>
                      <p className="text-sm font-bold text-navy">{p(q.label)}</p>
                      {/* 2 or 3 answers: one row; 4: two rows of two; 6: two rows of three */}
                      <div className={`mt-1.5 grid gap-1.5 ${q.options.length === 4 ? "grid-cols-2" : q.options.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                        {q.options.map((o) => {
                          const on = answers[q.id] === o.value;
                          return (
                            <button
                              key={o.value}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              onClick={() => answer(q.id, o.value)}
                              className={`min-h-10 rounded-xl border-2 px-2 py-1.5 text-sm font-bold leading-tight transition-colors ${
                                on ? "border-navy bg-navy text-paper" : "border-navy/20 bg-white text-navy hover:border-navy"
                              }`}
                            >
                              {p(o.label)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div>
              <h3 className="font-display text-base font-extrabold text-navy">{p(t.emergency.whereQ)}</h3>
              <p className="mt-0.5 text-sm text-navy/65">{p(t.emergency.whereHint)}</p>
            </div>
            <LocationPicker value={pin} onChange={setPin} />
            <div>
              <label htmlFor="emergency-phone" className="font-display text-sm font-extrabold text-navy">
                {p(t.emergency.yourPhone)}
              </label>
              <PhoneInput
                id="emergency-phone"
                country={country}
                onCountry={setCountry}
                value={local}
                onChange={setLocal}
                onBlur={() => setPhoneTouched(true)}
                invalid={phoneTouched && local.trim() !== "" && !phoneOk}
              />
              {phoneTouched && local.trim() !== "" && !phoneOk && (
                <p className="mt-1 text-sm font-semibold text-red-700">{p(t.misc.phoneLocalInvalid)}</p>
              )}
            </div>
            <button
              type="button"
              onClick={send}
              disabled={!pin || !phoneOk || report.isPending}
              className="btn-pill-primary min-h-14 justify-center text-lg disabled:opacity-40"
            >
              {report.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              {p(t.emergency.sendDetails)}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
