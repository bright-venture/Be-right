import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import type { ServiceCategory } from "@contracts/services";
import type { BookingForm } from "./useBookingForm";

/** Step 2: the service's questions. */
export function StepQuestions({ form, cat }: { form: BookingForm; cat: ServiceCategory }) {
  const { p } = useI18n();
  const { answers, setAnswers, questions } = form;
  return (
    <>
      <h2 className="flex items-center gap-3 font-display text-xl font-extrabold text-navy">
        <ServiceIcon id={cat.id} className="h-7 w-7 text-bird" />
        {p(cat.name)}
      </h2>
      <div className="mt-6 flex flex-col gap-6">
        {questions.map((q) => (
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
            <div className="flex flex-wrap gap-2">
              {q.options?.map((o) => {
                const active = answers[q.id] === o.value;
                return (
                  <button
                    key={o.value}
                    onClick={() =>
                      setAnswers((a) => ({ ...a, [q.id]: o.value }))
                    }
                    className={`min-h-11 rounded-full border-2 px-5 py-2 text-sm font-bold transition-all active:scale-[0.97] ${
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
          </fieldset>
        ))}
      </div>
    </>
  );
}
