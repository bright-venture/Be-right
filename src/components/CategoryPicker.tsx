import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import {
  ChevronRight,
  ChevronLeft,
  MapPin,
  Siren,
  X,
} from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import { CATEGORY_MAP, FACILITY_GROUP, FACILITY_SERVICES, SERVICES_IN_ORDER, type LocalText } from "@contracts/services";
import { CATEGORY_PROBLEMS, PROBLEM_MAP } from "@contracts/picker";

/**
 * Checkatrade-inspired category pill row in Be Right branding:
 * - Emergency pill first (flame, siren): opens the Emergency screen, where the
 *   customer picks the service and what's wrong, then calls.
 * - Other pills are rounded white with the Be Right service icons.
 * - A pill click opens a centered white modal over a blurred/dimmed backdrop:
 *   problem -> location -> the existing booking flow.
 *   Back / Close / Escape, focus trap, and choices are preserved on Back.
 */

type Wizard = { catId: string } | null;

export function CategoryPicker() {
  const { t, p, dir } = useI18n();
  const navigate = useNavigate();
  const [wizard, setWizard] = useState<Wizard>(null);
  const [step, setStep] = useState(0); // 0 = problem, 1 = location
  const [problem, setProblem] = useState("");
  const [area, setArea] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const openWizard = (w: NonNullable<Wizard>, preselect = "") => {
    setWizard(w);
    setStep(preselect ? 1 : 0);
    setProblem(preselect);
  };
  const closeWizard = () => {
    setWizard(null);
    setStep(0);
    setProblem("");
    setArea("");
  };

  // Rail scroll state: arrows enable/disable at the ends (RTL-aware).
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 8) {
        setCanPrev(false);
        setCanNext(false);
        return;
      }
      // Chrome RTL scrollLeft runs 0 -> negative; distance from start is |scrollLeft|.
      const dist = Math.abs(el.scrollLeft);
      setCanPrev(dist > 8);
      setCanNext(dist < max - 8);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  // step=1 scrolls toward the END of the rail (visual "next"), RTL-correct.
  const scrollRail = (step: 1 | -1) => {
    const el = rowRef.current;
    if (!el) return;
    const amount = Math.max(220, Math.round(el.clientWidth * 0.72));
    el.scrollBy({
      left: (dir === "rtl" ? -1 : 1) * step * amount,
      behavior: "smooth",
    });
  };

  // Modal: Escape closes, focus trap, body scroll lock.
  useEffect(() => {
    if (!wizard) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>("button, input")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeWizard();
        return;
      }
      if (e.key === "Tab" && dialog) {
        const focusables = dialog.querySelectorAll<HTMLElement>(
          'button, input, [href], [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey, true);
    };
  }, [wizard]);

  const goToBooking = () => {
    const map = PROBLEM_MAP[problem];
    const catId = wizard?.catId ?? map?.cat ?? "plumbing";
    const params = new URLSearchParams({ cat: catId });
    if (map && Object.keys(map.answers).length)
      params.set("ans", JSON.stringify(map.answers));
    if (area.trim()) params.set("area", area.trim());
    closeWizard();
    navigate(`/book?${params.toString()}`);
  };

  const problemList = wizard ? (CATEGORY_PROBLEMS[wizard.catId] ?? []) : [];

  const wizardTitle = !wizard
    ? ""
    : step > 0
      ? p(t.picker.locationQ)
      : dir === "rtl"
        ? wizard.catId === "plumbing"
          ? "ما الذي تريد من السبّاك إصلاحه؟"
          : `ما الذي تحتاجه في خدمة ${p(CATEGORY_MAP[wizard.catId].name)}؟`
        : `What do you need a ${p((t.picker.trades as Record<string, LocalText>)[wizard.catId] ?? CATEGORY_MAP[wizard.catId].name).toLowerCase()} to help with?`;

  return (
    <div className="category-rail hero-enter hero-d6 relative z-10 mt-10 w-full">
      {/* ---- Pill rail: full-width, arrows OUTSIDE the clipped strip ---- */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={dir === "rtl" ? "السابق" : "Previous"}
          disabled={!canPrev}
          onClick={() => scrollRail(-1)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-navy bg-white text-navy shadow-[0_2px_0_rgb(12_43_92/0.9)] transition-opacity disabled:cursor-default disabled:opacity-25"
        >
          {dir === "rtl" ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>

        <div
          ref={rowRef}
          role="group"
          aria-label={dir === "rtl" ? "فئات الخدمات" : "Service categories"}
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              scrollRail(dir === "rtl" ? -1 : 1);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              scrollRail(dir === "rtl" ? 1 : -1);
            }
          }}
          className="flex flex-1 snap-x snap-mandatory gap-2.5 overflow-x-auto rounded-2xl py-2 [-ms-overflow-style:none] [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-flame [&::-webkit-scrollbar]:hidden"
        >
          {/* Emergency, highlighted with the siren: opens the Emergency screen. */}
          <button
            type="button"
            onClick={() => navigate("/emergency")}
            className="flex shrink-0 snap-start items-center gap-2 rounded-full border-2 border-flame bg-flame px-4 py-2.5 font-display text-sm font-black text-white shadow-[0_3px_0_#081E42] transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <Siren className="h-4 w-4" />
            {p(t.picker.emergency)}
          </button>

          {/* Category pills, rounded white with Be Right icons; the facility services follow
              their group name. */}
          {SERVICES_IN_ORDER.map(id => (
            <Fragment key={id}>
              {id === FACILITY_SERVICES[0] && (
                <span className="flex shrink-0 snap-start items-center gap-2.5 ps-2 font-display text-xs font-black uppercase tracking-[0.14em] text-navy/60">
                  <span aria-hidden className="h-6 w-px bg-navy/20" />
                  {p(FACILITY_GROUP.name)}
                </span>
              )}
              <button
                type="button"
                onClick={() =>
                  CATEGORY_PROBLEMS[id]?.length
                    ? openWizard({ catId: id })
                    : navigate(`/book?cat=${id}`)
                }
                className="flex shrink-0 snap-start items-center gap-2 rounded-full border-[1.5px] border-navy/15 bg-white px-4 py-2.5 text-sm font-bold text-navy shadow-[0_2px_0_rgb(12_43_92/0.12)] transition-all hover:-translate-y-0.5 hover:border-navy hover:shadow-[0_4px_0_rgb(12_43_92/0.25)] focus-visible:outline-2 focus-visible:outline-flame"
              >
                <ServiceIcon id={id} className="h-5 w-5 text-flame" />
                {p(CATEGORY_MAP[id].name)}
              </button>
            </Fragment>
          ))}
        </div>

        <button
          type="button"
          aria-label={dir === "rtl" ? "التالي" : "Next"}
          disabled={!canNext}
          onClick={() => scrollRail(1)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-navy bg-white text-navy shadow-[0_2px_0_rgb(12_43_92/0.9)] transition-opacity disabled:cursor-default disabled:opacity-25"
        >
          {dir === "rtl" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* ---- Guided modal: portaled to <body> too. The rail keeps a transform from its
           entrance animation, which would otherwise trap this "fixed" overlay inside it. ---- */}
      {wizard &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label={wizardTitle}
          >
            <button
              aria-label={p(t.picker.close)}
              className="absolute inset-0 cursor-default bg-navy/45 backdrop-blur-sm"
              onClick={closeWizard}
            />
            <div
              ref={dialogRef}
              className="relative w-full max-w-md rounded-[24px] border-2 border-navy bg-white p-6 shadow-[0_10px_0_rgb(12_43_92/0.3)]"
            >
              <div className="flex items-center justify-between gap-3">
                {step > 0 ? (
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="flex items-center gap-1 text-sm font-bold text-navy/60 transition-colors hover:text-flame"
                  >
                    {dir === "rtl" ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronLeft className="h-4 w-4" />
                    )}
                    {p(t.picker.back)}
                  </button>
                ) : (
                  <span className="w-14" />
                )}
                <h3 className="flex-1 text-center font-display text-lg font-black leading-snug text-navy">
                  {wizardTitle}
                </h3>
                <button
                  type="button"
                  onClick={closeWizard}
                  aria-label={p(t.picker.close)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-navy/20 text-navy transition-colors hover:border-flame hover:text-flame"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {step === 0 && (
                <div className="mt-5 flex flex-col gap-2">
                  {problemList.map(id => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setProblem(id);
                        setStep(1);
                      }}
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl border-[1.5px] px-4 py-3 text-start text-sm font-bold transition-all ${
                        problem === id
                          ? "border-flame bg-flame/5 text-navy"
                          : "border-navy/20 bg-white text-navy hover:border-navy hover:bg-paper"
                      }`}
                    >
                      {p(
                        t.picker.problems[id as keyof typeof t.picker.problems]
                      )}
                      <ChevronRight className="h-4 w-4 shrink-0 text-navy/40 rtl:-scale-x-100" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setProblem("");
                      setStep(1);
                    }}
                    className="mt-1 text-center text-xs font-bold text-navy/50 underline underline-offset-2 hover:text-flame"
                  >
                    {p(t.picker.otherHelp)}
                  </button>
                </div>
              )}

              {step === 1 && (
                <form
                  className="mt-5"
                  onSubmit={e => {
                    e.preventDefault();
                    goToBooking();
                  }}
                >
                  <label className="flex items-center gap-2 rounded-2xl border-[1.5px] border-navy/25 bg-paper px-4 py-3 focus-within:border-flame">
                    <MapPin className="h-5 w-5 shrink-0 text-flame" />
                    <input
                      value={area}
                      onChange={e => setArea(e.target.value)}
                      placeholder={p(t.picker.locationPh)}
                      className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-navy outline-none placeholder:text-navy/40"
                    />
                  </label>
                  <button
                    type="submit"
                    className="btn-pill-primary mt-4 w-full !min-h-12 text-base"
                  >
                    {p(t.picker.continue)}
                    <ChevronRight className="h-5 w-5 rtl:-scale-x-100" />
                  </button>
                </form>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
