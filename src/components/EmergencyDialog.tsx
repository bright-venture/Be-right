import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, Loader2, Send, Siren, X } from "lucide-react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { isNetworkError, isRateLimited } from "@/lib/errors";
import LocationPicker, { type Pin } from "@/components/map/LocationPicker";
import { EmergencyLine } from "@/components/EmergencyLine";
import { EMERGENCY_PROBLEM_MAP } from "@contracts/emergency";
import { DEFAULT_PHONE_COUNTRY, isValidLocalPhone, joinPhone, type PhoneCountry } from "@contracts/phone";
import { PhoneInput } from "@/components/PhoneInput";

/**
 * Priority dispatch, after picking the emergency: where you are and your phone, Send details, then the
 * emergency line to call. The specialist who answers sees it and adds the rest on the phone.
 * The number shows once the details are sent (or if sending fails, so a call is still possible).
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
  const label = EMERGENCY_PROBLEM_MAP[problem]?.label;
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
    report.mutate({ problem, lat: pin.lat, lng: pin.lng, phone });
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
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
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
