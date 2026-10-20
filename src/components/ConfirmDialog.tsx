import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { useI18n } from "@/i18n";

export type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  /** The button that goes ahead, e.g. "Dismiss" or "Delete my account". */
  confirmLabel: string;
  /** Red for what can't be undone. */
  tone?: "danger" | "default";
  /** The button that goes back, when "Cancel" would be confusing (e.g. next to "Cancel request"). */
  cancelLabel?: string;
};

/**
 * "Are you sure?" before an action, in the page's own style (the browser's confirm box
 * looks foreign, and on phones shows the site's address). Cancel has the focus, so Enter
 * or Escape never goes ahead by accident.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  tone = "default",
  cancelLabel,
  onAnswer,
}: ConfirmOptions & { onAnswer: (ok: boolean) => void }) {
  const { t, p } = useI18n();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const danger = tone === "danger";

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onAnswer(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onAnswer]);

  const Icon = danger ? AlertTriangle : HelpCircle;
  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        tabIndex={-1}
        aria-label={p(t.confirm.cancel)}
        className="absolute inset-0 cursor-default bg-navy/45 backdrop-blur-sm"
        onClick={() => onAnswer(false)}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={message ? "confirm-message" : undefined}
        className="relative w-full max-w-md rounded-2xl border border-navy/12 bg-white p-5 shadow-[0_20px_50px_rgb(12_43_92/0.25)] sm:p-6"
      >
        <div className="flex items-start gap-3.5">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              danger ? "bg-red-700/10 text-red-700" : "bg-navy/[0.06] text-navy"
            }`}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <h2 id="confirm-title" className="font-display text-lg font-extrabold leading-snug text-navy">
              {title}
            </h2>
            {message && (
              <div id="confirm-message" className="mt-1.5 text-sm leading-relaxed text-navy/70">
                {message}
              </div>
            )}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onAnswer(false)}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-navy/15 px-4 text-sm font-semibold text-navy hover:bg-navy/5"
          >
            {cancelLabel ?? p(t.confirm.cancel)}
          </button>
          <button
            type="button"
            onClick={() => onAnswer(true)}
            className={`inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold text-white ${
              danger ? "bg-red-700 hover:bg-red-800" : "bg-navy hover:bg-navy/90"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
