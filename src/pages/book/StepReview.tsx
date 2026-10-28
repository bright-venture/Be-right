import { ReceiptText } from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { AuthPanel } from "@/components/AuthPanel";
import { AgreeCheckbox } from "@/components/AgreeCheckbox";
import { useI18n } from "@/i18n";
import { hoursText } from "@contracts/visitTime";
import type { ServiceCategory } from "@contracts/services";
import type { BookingForm } from "./useBookingForm";

/** Step 5: check everything, sign in or up if needed, and agree to the terms. */
export function StepReview({ form, cat }: { form: BookingForm; cat: ServiceCategory }) {
  const { t, p } = useI18n();
  const { user, isAuthenticated, authLoading, answers, date, slot, fromHour, toHour, area, questions, contactPhone, hourly, hoursOk, needsTerms, agreedNow, setAgreedNow } = form;
  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-xl font-extrabold text-navy">
        {p(t.book.reviewTitle)}
      </h2>
      <div className="card-br p-5">
        <div className="flex items-center gap-3">
          <ServiceIcon id={cat.id} className="h-8 w-8 text-bird" />
          <span className="font-display text-lg font-extrabold text-navy">
            {p(cat.name)}
          </span>
        </div>
        <dl className="mt-4 flex flex-col gap-2 text-sm">
          {questions.map((q) => {
            const opt = q.options?.find(
              (o) => o.value === answers[q.id],
            );
            return (
              <div key={q.id} className="flex justify-between gap-4">
                <dt className="text-navy/70">{p(q.label)}</dt>
                <dd className="text-end font-bold text-navy">
                  {opt ? p(opt.label) : answers[q.id]}
                </dd>
              </div>
            );
          })}
          <div className="mt-2 border-t-2 border-navy/10 pt-3">
            <div className="flex justify-between gap-4">
              <dt className="text-navy/70">{p(t.book.date)}</dt>
              <dd className="font-bold text-navy">
                {date} · {p(
                  hourly && hoursOk
                    ? hoursText(fromHour as number, toHour as number)
                    : slot === "morning"
                      ? t.book.slotMorning
                      : slot === "afternoon"
                        ? t.book.slotAfternoon
                        : t.book.slotEvening,
                )}
              </dd>
            </div>
            <div className="mt-2 flex justify-between gap-4">
              <dt className="text-navy/70">{p(t.book.area)}</dt>
              <dd className="text-end font-bold text-navy">{area}</dd>
            </div>
            <div className="mt-2 flex justify-between gap-4">
              <dt className="text-navy/70">{p(t.book.phone)}</dt>
              <dd className="font-bold text-navy" dir="ltr">{contactPhone}</dd>
            </div>
          </div>
        </dl>
      </div>

      <p className="card-br border-flame p-5 text-sm leading-relaxed text-navy/80">{p(t.book.reviewNote)}</p>

      {/* The visit fee, agreed before booking (contracts/workflow.ts). */}
      <div className="card-br flex items-start gap-3 p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-flame/10 text-flame">
          <ReceiptText className="h-5 w-5" />
        </span>
        <div>
          <p className="font-display text-sm font-extrabold text-navy">{p(t.book.visitFeeTitle)}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-navy/80">{p(t.book.visitFeeBody)}</p>
        </div>
      </div>

      {!authLoading && !isAuthenticated && (
        <div className="card-br border-flame p-5">
          <h3 className="font-display text-lg font-extrabold text-navy">
            {p(t.book.confirmTitle)}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-navy/70">
            {p(t.book.confirmBody)}
          </p>
          <div className="mt-5">
            <AuthPanel next="/book" initialMode="signup" headingLevel="h3" />
          </div>
        </div>
      )}
      {isAuthenticated && user?.email && (
        <p className="text-sm text-navy/70">
          {p(t.book.sendingAs)}{" "}
          <span className="font-bold text-navy" dir="ltr">
            {user.email}
          </span>
        </p>
      )}
      {needsTerms && (
        <AgreeCheckbox id="book-agree" text={t.legal.agreeBooking} checked={agreedNow} onChange={setAgreedNow} />
      )}
    </div>
  );
}
