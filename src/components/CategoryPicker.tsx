import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Siren,
} from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import { CATEGORY_MAP, FACILITY_GROUP, FACILITY_SERVICES, SERVICES_IN_ORDER } from "@contracts/services";
import { EmergencyDialog } from "@/components/EmergencyDialog";
import { EMERGENCY_PROBLEMS } from "@contracts/emergency";

/**
 * Checkatrade-inspired category pill row in Be Right branding:
 * - Emergency pill first (flame, siren, chevron): priority dispatch. Pick the emergency,
 *   share where you are, send it, then call the emergency line (EmergencyDialog).
 * - Other pills are rounded white with the Be Right service icons; each opens the booking
 *   form on that service, at its questions.
 */

export function CategoryPicker() {
  const { t, p, dir } = useI18n();
  const navigate = useNavigate();
  const rowRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(false);
  /** The emergency picked from the dropdown: its dialog is open. */
  const [emergency, setEmergency] = useState<string | null>(null);
  const emergencyBtnRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; flip: boolean } | null>(null);

  // The Emergency dropdown is portaled to <body> (fixed), so the rail's horizontal
  // scrolling can never clip it; its position follows the pill.
  useEffect(() => {
    if (!openDropdown) return;
    const update = () => {
      const btn = emergencyBtnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const W = 288; // w-72
      let left = dir === "rtl" ? r.right - W : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - W - 8));
      const below = window.innerHeight - r.bottom;
      const flip = below < 360 && r.top > below;
      setDropPos({ top: flip ? r.top - 8 : r.bottom + 8, left, flip });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [openDropdown, dir]);

  // Close the Emergency dropdown on an outside click or Escape.
  useEffect(() => {
    if (!openDropdown) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current?.contains(target) || emergencyBtnRef.current?.contains(target)) return;
      setOpenDropdown(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenDropdown(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [openDropdown]);

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
          {/* Emergency, highlighted with the siren and chevron: tap toggles the dropdown. */}
          <div ref={emergencyBtnRef} className="relative shrink-0 snap-start">
            <button
              type="button"
              onClick={() => setOpenDropdown((v) => !v)}
              aria-expanded={openDropdown}
              aria-haspopup="menu"
              className="flex items-center gap-2 rounded-full border-2 border-flame bg-flame px-4 py-2.5 font-display text-sm font-black text-white shadow-[0_3px_0_#081E42] transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <Siren className="h-4 w-4" />
              {p(t.picker.emergency)}
              <ChevronDown className={`h-4 w-4 transition-transform ${openDropdown ? "rotate-180" : ""}`} />
            </button>
          </div>

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
                onClick={() => navigate(`/book?cat=${id}`)}
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

      {/* ---- Emergency dropdown: portaled out of the rail (no clipping) ---- */}
      {openDropdown &&
        dropPos &&
        createPortal(
          <div
            ref={dropdownRef}
            role="menu"
            aria-label={p(t.picker.emergency)}
            style={{
              position: "fixed",
              top: dropPos.top,
              left: dropPos.left,
              transform: dropPos.flip ? "translateY(-100%)" : undefined,
            }}
            className="z-[80] w-72 overflow-hidden rounded-2xl border-2 border-navy bg-white shadow-[0_8px_0_rgb(12_43_92/0.25)]"
          >
            <div className="border-b border-navy/10 px-4 py-2.5 font-display text-[11px] font-black uppercase tracking-[0.18em] text-flame">
              {p(t.emergency.dispatchTitle)}
            </div>
            <ul className="max-h-[min(360px,60vh)] overflow-y-auto">
              {EMERGENCY_PROBLEMS.map((x) => (
                <li key={x.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpenDropdown(false);
                      setEmergency(x.id);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-start text-sm font-bold text-navy transition-colors hover:bg-paper"
                  >
                    {p(x.label)}
                    <ChevronRight className="h-4 w-4 shrink-0 text-navy/40 rtl:-scale-x-100" />
                  </button>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}

      {emergency && <EmergencyDialog problem={emergency} onClose={() => setEmergency(null)} />}
    </div>
  );
}
