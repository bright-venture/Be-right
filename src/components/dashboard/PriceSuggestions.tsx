import { useState } from "react";
import { Check, Loader2, Star } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/router";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { CATEGORY_MAP } from "@contracts/services";
import { TRANSPORT_LABELS } from "@contracts/applications";
import { REGION_LABELS, REGIONS, type Region } from "@contracts/pricing";
import { Avatar } from "./RequestDetail";

export type Suggestion = inferRouterOutputs<AppRouter>["pricing"]["suggest"]["technicians"][number];

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/**
 * While a specialist prices a request: every technician with a suggested price (service +
 * region + travel, contracts/pricing.ts), their trade first, nearest first. Picking one fills
 * in the price; it can still be changed before sending.
 */
export function PriceSuggestions({
  requestId,
  region,
  onRegion,
  chosenId,
  onPick,
}: {
  requestId: number;
  region: Region | "";
  onRegion: (r: Region) => void;
  chosenId: number | null;
  onPick: (tech: Suggestion) => void;
}) {
  const { t, p } = useI18n();
  const [showOthers, setShowOthers] = useState(false);
  const suggest = trpc.pricing.suggest.useQuery({ id: requestId, region: region || undefined });
  const data = suggest.data;
  const techs = data?.technicians ?? [];
  const same = techs.filter((x) => x.sameTrade);
  // No one in this trade (or an "Other" request): everyone is a candidate.
  const main = same.length ? same : techs;
  const others = same.length ? techs.filter((x) => !x.sameTrade) : [];

  return (
    <div className="mt-3 rounded-2xl border-2 border-navy/15 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-navy/10 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-extrabold text-navy">{p(t.prices.suggestTitle)}</p>
          <p className="mt-0.5 text-xs text-navy/60">{p(t.prices.suggestHint)}</p>
        </div>
        <select
          value={region || data?.region || ""}
          onChange={(e) => onRegion(e.target.value as Region)}
          aria-label={p(t.book.region)}
          className={`h-9 rounded-lg border bg-white px-3 text-sm font-semibold text-navy focus:outline-none ${
            region || data?.region ? "border-navy/15" : "border-flame"
          }`}
        >
          <option value="" disabled>
            {p(t.prices.chooseRegion)}
          </option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {p(REGION_LABELS[r])}
            </option>
          ))}
        </select>
      </div>

      {suggest.isLoading ? (
        <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-navy" />
      ) : suggest.error ? (
        <p className="px-4 py-3 text-xs font-semibold text-destructive">{suggest.error.message}</p>
      ) : techs.length === 0 ? (
        <p className="px-4 py-4 text-sm text-navy/60">{p(t.prices.noTechnicians)}</p>
      ) : (
        <>
          {data && !data.hasPin && <p className="px-4 pt-3 text-xs font-semibold text-flame-ink">{p(t.prices.noPin)}</p>}
          <ul className="divide-y divide-navy/10">
            {main.map((x) => (
              <Row key={x.id} tech={x} chosen={chosenId === x.id} onPick={() => onPick(x)} />
            ))}
            {showOthers && others.map((x) => <Row key={x.id} tech={x} chosen={chosenId === x.id} onPick={() => onPick(x)} />)}
          </ul>
          {others.length > 0 && (
            <button
              type="button"
              onClick={() => setShowOthers((v) => !v)}
              className="w-full border-t border-navy/10 px-4 py-2.5 text-start text-xs font-bold text-navy/70 hover:bg-navy/[0.03]"
            >
              {showOthers ? p(t.prices.hideOthers) : p(t.prices.showOthers).replace("{n}", String(others.length))}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Row({ tech: x, chosen, onPick }: { tech: Suggestion; chosen: boolean; onPick: () => void }) {
  const { t, p } = useI18n();
  const price = x.price;
  const trade = x.trade ? CATEGORY_MAP[x.trade] : null;
  const facts = [
    x.transport ? p(TRANSPORT_LABELS[x.transport]) : null,
    price.roadKm != null ? p(t.prices.km).replace("{n}", String(price.roadKm)) : null,
    `${p(t.dash4.activeJobs)}: ${x.activeJobs}`,
  ].filter(Boolean);
  const parts = price.service != null ? price.service + price.region + (price.travel ?? 0) : null;
  // The gaps that matter here: a missing region shows on the region box above.
  const gaps = price.gaps.filter((g) => g !== "region");

  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 ${chosen ? "bg-bird/[0.06]" : ""}`}>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={x.name} photoUrl={x.photoUrl} size="h-9 w-9" />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 text-sm font-bold text-navy">
            <span className="truncate">{x.name ?? "-"}</span>
            {x.rating.average !== null && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-navy/70">
                <Star className="h-3 w-3 text-flame" fill="currentColor" aria-hidden /> {x.rating.average.toFixed(1)}
              </span>
            )}
            {!x.sameTrade && trade && (
              <span className="inline-flex items-center gap-1 rounded-full bg-navy/[0.06] px-2 py-px text-[11px] font-semibold text-navy/70">
                <ServiceIcon id={x.trade!} className="h-3 w-3" /> {p(trade.name)}
              </span>
            )}
            {price.tooFar && (
              <span className="rounded-full bg-flame/10 px-2 py-px text-[11px] font-bold text-flame-ink">{p(t.prices.tooFar)}</span>
            )}
          </p>
          <p className="truncate text-xs text-navy/60">{facts.join(" · ")}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-display text-lg font-black text-navy">{price.total != null ? money(price.total) : "-"}</span>
        <button
          type="button"
          onClick={onPick}
          aria-pressed={chosen}
          className={`inline-flex h-9 min-w-[4.5rem] items-center justify-center gap-1 rounded-lg px-3 text-xs font-bold ${
            chosen ? "bg-navy text-white" : "border border-navy/25 text-navy hover:bg-navy/5"
          }`}
        >
          {chosen && <Check className="h-3.5 w-3.5" />}
          {p(chosen ? t.prices.picked : t.prices.pick)}
        </button>
      </div>
      <p className="col-span-2 text-xs text-navy/60">
        {price.service != null && (
          <>
            {p(t.prices.breakdown)
              .replace("{service}", money(price.service))
              .replace("{region}", money(price.region))
              .replace("{travel}", price.travel != null ? money(price.travel) : "-")}
            {price.total != null && parts != null && price.total > Math.ceil(parts) && ` (${p(t.prices.raisedToMinimum)})`}
          </>
        )}
        {gaps.map((g) => (
          <span key={g} className="block font-semibold text-flame-ink">
            {p(t.prices.gaps[g])}
          </span>
        ))}
      </p>
    </li>
  );
}
