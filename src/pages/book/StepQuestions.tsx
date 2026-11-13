import { useState } from "react";
import { ShieldAlert, Siren } from "lucide-react";
import { EmergencyDialog } from "@/components/EmergencyDialog";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import { askedAnswers, type ServiceCategory } from "@contracts/services";
import type { BookingForm } from "./useBookingForm";

/** Step 2: the service's questions. */
export function StepQuestions({ form, cat }: { form: BookingForm; cat: ServiceCategory }) {
  const { t, p } = useI18n();
  const { answers, setAnswers, questions } = form;
  /** The emergency whose priority dispatch is open over the form. */
  const [dispatch, setDispatch] = useState<string | null>(null);
  // The first answer that makes it an emergency (the problem's own comes before "can it be controlled?").
  const emergency = questions
    .map((q) => q.options?.find((o) => o.value === answers[q.id])?.emergency)
    .find(Boolean);
  return (
    <>
      <h2 className="flex items-center gap-3 font-display text-xl font-extrabold text-navy">
        <ServiceIcon id={cat.id} className="h-7 w-7 text-bird" />
        {p(cat.name)}
      </h2>
      <div className="mt-6 flex flex-col gap-6">
        {questions.map((q) => {
          const safety = q.options?.find((o) => o.value === answers[q.id])?.safety;
          return (
            <fieldset key={q.id} className="card-br p-5">
              <legend className="px-2 font-display text-base font-extrabold text-navy">
                {p(q.label)}
              </legend>
              {q.hint && (
                <p className="mb-3 text-xs font-medium text-flame">
                  {p(q.hint)}
                </p>
              )}
              {q.kind === "text" && (
                <textarea
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  maxLength={500}
                  rows={4}
                  aria-label={p(q.label)}
                  className="w-full rounded-2xl border-2 border-navy/30 bg-white px-4 py-3 font-semibold text-navy focus:border-flame focus:outline-none"
                />
              )}
              {/* Rows of 2 (of 4 on wider screens when they fill evenly); an odd last option takes the whole row. */}
              <div className={`grid grid-cols-2 gap-2 ${(q.options?.length ?? 0) % 4 === 0 ? "sm:grid-cols-4" : ""}`}>
                {q.options?.map((o, i, all) => {
                  const active = answers[q.id] === o.value;
                  return (
                    <button
                      key={o.value}
                      onClick={() => {
                        // a changed answer can hide a follow-up question answered before
                        setAnswers((a) => askedAnswers(cat.questions, { ...a, [q.id]: o.value }));
                        // an emergency doesn't wait for a booking: straight to priority dispatch
                        if (o.emergency) setDispatch(o.emergency);
                      }}
                      className={`min-h-11 rounded-2xl border-2 px-3 py-2 text-center text-sm font-bold leading-tight transition-all active:scale-[0.97] ${
                        all.length % 2 === 1 && i === all.length - 1 ? "col-span-2" : ""
                      } ${
                        active
                          ? "border-navy bg-navy text-paper"
                          : "border-navy/30 bg-white text-navy hover:border-navy"
                      }`}
                    >
                      {p(o.label)}
                    </button>
                  );
                })}
              </div>
              {/* what to do now, for a risky answer */}
              {safety && (
                <ul role="alert" className="mt-4 flex flex-col gap-2 rounded-2xl border-2 border-red-700/25 bg-red-700/[0.04] p-4">
                  {safety.map((s, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm font-bold leading-snug text-navy">
                      <ShieldAlert className="h-5 w-5 shrink-0 text-red-700" />
                      {p(s)}
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>
          );
        })}
        {emergency && (
          <div className="rounded-2xl bg-flame p-5 text-white">
            <p className="flex items-start gap-3 text-sm font-bold leading-snug">
              <Siren className="h-6 w-6 shrink-0" />
              {p(t.book.urgent)}
            </p>
            <button
              type="button"
              onClick={() => setDispatch(emergency)}
              className="mt-4 min-h-11 w-full rounded-full bg-white px-5 py-2 font-display text-sm font-extrabold text-flame active:scale-[0.97]"
            >
              {p(t.book.urgentButton)}
            </button>
          </div>
        )}
      </div>
      {dispatch && <EmergencyDialog problem={dispatch} onClose={() => setDispatch(null)} />}
    </>
  );
}
