import { ServiceIcon } from "@/components/ServiceIcon";
import { OtherServiceBar } from "@/components/OtherServiceBar";
import { useI18n } from "@/i18n";
import {
  TRADE_SERVICES,
  FACILITY_GROUP,
  FACILITY_SERVICES,
  OTHER_SERVICE,
  CATEGORY_MAP,
  CATEGORY_TINT,
} from "@contracts/services";
import type { BookingForm } from "./useBookingForm";

/** Step 1: which service. */
export function StepService({ form }: { form: BookingForm }) {
  const { t, p } = useI18n();
  const { setStep, category, setCategory, setAnswers } = form;
  return (
    <>
      <h2 className="font-display text-xl font-extrabold text-navy">
        {p(t.book.pickCategory)}
      </h2>
      {/* The nine trades in three rows of three, then the five facility services in one row
          (on phones two per row, the last tile of an odd group wide). */}
      {[
        { ids: TRADE_SERVICES, cols: "sm:grid-cols-3", title: null },
        { ids: FACILITY_SERVICES, cols: "sm:grid-cols-5", title: FACILITY_GROUP.name },
      ].map((group) => (
        <div key={group.cols}>
          {group.title && (
            <h3 className="mt-8 font-display text-base font-extrabold text-navy">{p(group.title)}</h3>
          )}
          <div className={`mt-4 grid grid-cols-2 gap-3 ${group.cols}`}>
            {group.ids.map((id) => CATEGORY_MAP[id]).filter(Boolean).map((c, i, all) => {
              const tint = CATEGORY_TINT[c.id] ?? { bg: "#ECEFF4", ink: "#0C2B5C" };
              const active = category === c.id;
              const wide = all.length % 2 === 1 && i === all.length - 1;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setCategory(c.id);
                    setAnswers({});
                    setStep(1);
                  }}
                  aria-pressed={active}
                  className={`${wide ? "col-span-2 sm:col-span-1" : ""} flex min-h-32 flex-col items-start justify-between gap-3 rounded-[26px] border-[1.5px] border-navy/12 bg-white p-4 text-start shadow-[0_3px_0_rgb(12_43_92/0.1)] transition-all hover:-translate-y-1 hover:border-navy hover:shadow-[0_6px_0_rgb(12_43_92/0.9)] ${
                    active ? "!border-navy !shadow-[0_6px_0_rgb(244_83_9/0.9)]" : ""
                  }`}
                  style={{
                    background: `linear-gradient(180deg, rgb(255 255 255 / 0.55) 0%, rgb(255 255 255 / 0) 60%), ${tint.bg}`,
                  }}
                >
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgb(8_30_66_/_0.12)]"
                    style={{ color: tint.ink }}
                  >
                    <ServiceIcon id={c.id} className="h-6 w-6" />
                  </span>
                  <span className="font-display text-sm font-extrabold leading-tight text-navy">
                    {p(c.name)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {/* Anything else, once, after every service. */}
      <OtherServiceBar
        id={OTHER_SERVICE}
        active={category === OTHER_SERVICE}
        onPick={() => {
          setCategory(OTHER_SERVICE);
          setAnswers({});
          setStep(1);
        }}
      />
    </>
  );
}
