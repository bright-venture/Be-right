import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/i18n";
import { ServiceIcon } from "@/components/ServiceIcon";
import { CATEGORY_MAP } from "@contracts/services";

/**
 * "Other" under a group of service tiles: a full-width bar, so the tile grids above stay
 * complete rows. The customer describes what they need; a specialist finds the technician.
 */
export function OtherServiceBar({ id, to, onPick, active = false }: { id: string; to?: string; onPick?: () => void; active?: boolean }) {
  const { p } = useI18n();
  const c = CATEGORY_MAP[id];
  if (!c) return null;
  const className = `group mt-3 flex w-full items-center gap-4 rounded-[22px] border-[1.5px] border-dashed bg-white px-4 py-3.5 text-start transition-all hover:-translate-y-0.5 hover:border-solid hover:border-navy focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-flame sm:mt-4 ${
    active ? "border-solid border-navy" : "border-navy/30"
  }`;
  const body = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy/[0.06] text-navy">
        <ServiceIcon id={id} className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-sm font-extrabold text-navy">{p(c.name)}</span>
        <span className="block text-xs leading-snug text-navy/65">{p(c.blurb)}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-navy/40 rtl:-scale-x-100" />
    </>
  );
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onPick} aria-pressed={active} className={className}>
      {body}
    </button>
  );
}
