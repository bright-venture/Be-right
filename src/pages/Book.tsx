import { Link, useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useI18n } from "@/i18n";
import { STEPS, useBookingForm } from "./book/useBookingForm";
import { StepService } from "./book/StepService";
import { StepQuestions } from "./book/StepQuestions";
import { StepPhotos } from "./book/StepPhotos";
import { StepWhenWhere } from "./book/StepWhenWhere";
import { StepReview } from "./book/StepReview";

export default function Book() {
  const { t, p } = useI18n();
  const navigate = useNavigate();
  const form = useBookingForm();
  const { cat, step, setStep, category, isAuthenticated, questionsAnswered, detailsReady, setSubmitError, submit, submitting, needsTerms, agreedNow, uploadProgress, submitError, doneId } = form;
  const stepLabels = [t.book.stepCategory, t.book.stepQuestions, t.book.stepPhotos, t.book.stepWhen, t.book.stepReview];

  /* ---------- success ---------- */
  if (doneId !== null) {
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-4 py-24 pt-24">
          <div className="card-br w-full max-w-lg p-8 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-navy bg-flame text-white">
              <Check className="h-8 w-8" />
            </span>
            <h1 className="mt-5 font-display text-3xl font-black text-navy">
              {p(t.book.successTitle)}
            </h1>
            <p className="mt-2 font-display text-sm font-bold uppercase tracking-[0.2em] text-navy/70">
              #{doneId}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-navy/70">
              {p(t.book.successBody)}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link to="/requests" className="btn-pill-primary">
                {p(t.book.viewRequests)}
              </Link>
              <button
                onClick={() => navigate(0)}
                className="btn-pill-outline"
              >
                {p(t.book.bookAnother)}
              </button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="dotgrid mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-24 sm:px-6">
        <h1 className="font-display text-3xl font-black text-navy sm:text-4xl">
          {p(t.book.title)}
        </h1>

        {/* segmented progress */}
        <div className="mt-6 flex gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full border border-navy/40 ${
                i <= step ? "bg-flame border-flame" : "bg-white"
              }`}
            />
          ))}
        </div>
        <p className="mt-2 font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/70">
          {step + 1} / {STEPS.length} · {p(stepLabels[step])}
        </p>

        <div className="mt-8 animate-rise-in" key={step}>
          {/* STEP 0 — category */}
          {step === 0 && <StepService form={form} />}

          {/* STEP 1 — guided questions */}
          {step === 1 && cat && <StepQuestions form={form} cat={cat} />}

          {/* STEP 2 — photos */}
          {step === 2 && <StepPhotos form={form} />}

          {/* STEP 3 — time & place */}
          {step === 3 && <StepWhenWhere form={form} />}

          {/* STEP 4 — review */}
          {step === 4 && cat && <StepReview form={form} cat={cat} />}
        </div>

        {/* nav buttons */}
        <div className="mt-10 flex items-center justify-between">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="btn-pill-outline disabled:opacity-30"
          >
            <ArrowLeft className="h-5 w-5 rtl:-scale-x-100" />
            {p(t.book.back)}
          </button>

          {step < 4 ? (
            <button
              onClick={() => {
                setSubmitError(null);
                setStep((s) => s + 1);
              }}
              disabled={
                (step === 0 && !category) ||
                (step === 1 && !questionsAnswered()) ||
                (step === 3 && !detailsReady)
              }
              className="btn-pill-primary disabled:opacity-40"
            >
              {p(t.book.next)}
              <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
            </button>
          ) : isAuthenticated ? (
            <button
              onClick={submit}
              disabled={submitting || (needsTerms && !agreedNow)}
              className="btn-pill-primary text-base disabled:opacity-40"
            >
              {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
              {uploadProgress
                ? `${p(t.book.uploadingPhotos)} ${uploadProgress.done + 1}/${uploadProgress.total}`
                : submitting
                  ? p(t.book.submitting)
                  : p(t.book.submit)}
            </button>
          ) : null}
        </div>
        {submitError && (
          <p className="mt-3 text-end text-sm font-semibold text-destructive">
            {submitError}
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
}
