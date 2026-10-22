import { Check } from "lucide-react";
import { useI18n } from "@/i18n";
import { DISTRICT_INFO, DISTRICTS, type District } from "@contracts/districts";

/**
 * Lebanon's 26 districts as tick boxes, two per row, each with a few of its towns so people
 * find theirs ("Sin el Fil" → Metn). Used on the application form and by admins.
 */
export function DistrictPicker({
  value,
  onChange,
  compact = false,
  labelledBy,
}: {
  value: readonly District[];
  onChange: (districts: District[]) => void;
  /** Staff screens: smaller boxes. */
  compact?: boolean;
  labelledBy?: string;
}) {
  const { p } = useI18n();
  const toggle = (d: District) =>
    onChange(value.includes(d) ? value.filter((x) => x !== d) : DISTRICTS.filter((x) => x === d || value.includes(x)));

  return (
    <div role="group" aria-labelledby={labelledBy} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {DISTRICTS.map((d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => toggle(d)}
            className={`flex items-start gap-2.5 border-2 text-start transition-colors ${
              compact ? "rounded-xl px-3 py-2" : "rounded-2xl px-3.5 py-2.5"
            } ${on ? "border-navy bg-navy/[0.06]" : "border-navy/20 bg-white hover:border-navy/50"}`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                on ? "border-navy bg-navy text-white" : "border-navy/30 bg-white"
              }`}
            >
              {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span className={`block font-bold text-navy ${compact ? "text-sm" : "text-[15px]"}`}>{p(DISTRICT_INFO[d].name)}</span>
              <span className="block truncate text-xs text-navy/55">{p(DISTRICT_INFO[d].towns)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
