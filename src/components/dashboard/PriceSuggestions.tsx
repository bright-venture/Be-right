import { useState } from "react";
import { Link } from "react-router";
import { Check, Info, Loader2, Star } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/router";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { CATEGORY_MAP } from "@contracts/services";
import { TRANSPORT_LABELS } from "@contracts/applications";
import { Avatar } from "./RequestDetail";
import { useAuth } from "@/hooks/useAuth";

export type Suggestion = inferRouterOutputs<AppRouter>["pricing"]["suggest"]["technicians"][number];

const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/**
 * While a specialist prices a request: every technician with a suggested price (service +
 * travel, contracts/pricing.ts), their trade first, nearest first. Picking one fills
 * in the price; it can still be changed before sending.
 */
export function PriceSuggestions({
  requestId,
  category,
  chosenId,
  onPick,
}: {
  requestId: number;
  category: string;
  chosenId: number | null;
  onPick: (tech: Suggestion) => void;
}) {
  const { t, p } = useI18n();
  const [showOthers, setShowOthers] = useState(false);
  const suggest = trpc.pricing.suggest.useQuery({ id: requestId });
  const data = suggest.data;
  const techs = data?.technicians ?? [];
  const same = techs.filter((x) => x.sameTrade);
  // No one in this trade (or an "Other" request): everyone is a candidate.
  const main = same.length ? same : techs;
  const others = same.length ? techs.filter((x) => !x.sameTrade) : [];
  // What's missing for everyone is said once, above the list, not on every row.
  const missingService = techs.length > 0 && techs[0].price.gaps.includes("service");
  const missingTravel = techs.length > 0 && techs.every((x) => x.price.gaps.includes("transport"));
  const shared = [...(missingService ? (["service"] as const) : []), ...(missingTravel ? (["transport"] as const) : [])];

  return (
    <div className="mt-3 rounded-2xl border-2 border-navy/15 bg-white">
      <div className="border-b border-navy/10 px-4 py-3">
        <p className="font-display text-sm font-extrabold text-navy">{p(t.prices.suggestTitle)}</p>
        <p className="mt-0.5 text-xs text-navy/60">{p(t.prices.suggestHint)}</p>
      </div>

      {suggest.isLoading ? (
        <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-navy" />
      ) : suggest.error ? (
        <p className="px-4 py-3 text-xs font-semibold text-destructive">{suggest.error.message}</p>
      ) : techs.length === 0 ? (
        <p className="px-4 py-4 text-sm text-navy/60">{p(t.prices.noTechnicians)}</p>
      ) : (
        <>
          {(missingService || missingTravel) && <MissingPrices category={category} service={missingService} travel={missingTravel} />}
          {data && !data.hasPin && <p className="px-4 pt-3 text-xs font-semibold text-flame-ink">{p(t.prices.noPin)}</p>}
          <ul className="divide-y divide-navy/10">
            {main.map((x) => (
              <Row key={x.id} tech={x} hide={shared} chosen={chosenId === x.id} onPick={() => onPick(x)} />
            ))}
            {showOthers &&
              others.map((x) => <Row key={x.id} tech={x} hide={shared} chosen={chosenId === x.id} onPick={() => onPick(x)} />)}
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

/** The price table isn't filled in yet: one note for the whole list, with the way to fix it. */
function MissingPrices({ category, service, travel }: { category: string; service: boolean; travel: boolean }) {
  const { t, p } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const name = CATEGORY_MAP[category] ? p(CATEGORY_MAP[category].name) : category;
  return (
    <div className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-flame/30 bg-flame/[0.06] px-3 py-2.5">
      <Info className="h-4 w-4 shrink-0 text-flame-ink" aria-hidden />
      <div className="min-w-0 flex-1 text-xs text-navy">
        {service && <p className="font-bold">{p(t.prices.missingService).replace("{service}", name)}</p>}
        {travel && <p className="font-bold">{p(t.prices.missingTravel)}</p>}
        <p className="mt-0.5 text-navy/65">{p(isAdmin ? t.prices.missingHintAdmin : t.prices.missingHintStaff)}</p>
      </div>
      {isAdmin && (
        <Link
          to="/admin?tab=prices"
          className="inline-flex h-8 items-center rounded-lg bg-navy px-3 text-xs font-bold text-white hover:bg-navy/90"
        >
          {p(t.prices.openPrices)}
        </Link>
      )}
    </div>
  );
}

function Row({
  tech: x,
  hide,
  chosen,
  onPick,
}: {
  tech: Suggestion;
  /** Gaps already said above the list. */
  hide: readonly string[];
  chosen: boolean;
  onPick: () => void;
}) {
  const { t, p } = useI18n();
  const price = x.price;
  const trade = x.trade ? CATEGORY_MAP[x.trade] : null;
  // Only part of the price: travel is missing (no starting point or no rate for their transport).
  const partial = price.total != null && price.travel == null;
  // Where the distance comes from: where they are now (Available), or their starting point.
  const minutes = x.seenMinutesAgo;
  const origin =
    x.from === "live"
      ? p(t.prices.liveAgo).replace("{time}", minutes != null && minutes >= 1 ? p(t.prices.minAgo).replace("{n}", String(minutes)) : p(t.prices.justNow))
      : x.from === "start"
        ? p(t.prices.fromStart)
        : null;
  const facts = [
    x.transport ? p(TRANSPORT_LABELS[x.transport]) : null,
    price.roadKm != null ? `${p(t.prices.km).replace("{n}", String(price.roadKm))}${origin ? ` (${origin})` : ""}` : null,
    `${p(t.dash4.activeJobs)}: ${x.activeJobs}`,
  ].filter(Boolean);
  const parts = price.service != null ? price.service + (price.travel ?? 0) : null;
  const gaps = price.gaps.filter((g) => !hide.includes(g));

  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 ${chosen ? "bg-bird/[0.06]" : ""}`}>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={x.name} photoUrl={x.photoUrl} size="h-9 w-9" />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 text-sm font-bold text-navy">
            <span className="truncate">{x.name ?? "-"}</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-px text-[11px] font-bold ${
                x.online ? "bg-green-700/10 text-green-800" : "bg-navy/[0.06] text-navy/55"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${x.online ? "bg-green-600" : "bg-navy/30"}`} />
              {p(x.online ? t.prices.available : t.prices.offline)}
            </span>
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
        {price.total != null ? (
          <span className="text-end leading-tight">
            <span className={`block font-display text-lg font-black ${partial ? "text-navy/55" : "text-navy"}`}>{money(price.total)}</span>
            {partial && <span className="block text-[11px] font-semibold text-navy/50">{p(t.prices.withoutTravel)}</span>}
          </span>
        ) : (
          <span className="text-xs font-semibold text-navy/45">{p(t.prices.noPrice)}</span>
        )}
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
      <p className="col-span-2 text-xs text-navy/60 empty:hidden">
        {price.service != null && (
          <>
            {price.travel != null
              ? p(t.prices.breakdown).replace("{service}", money(price.service)).replace("{travel}", money(price.travel))
              : p(t.prices.serviceOnly).replace("{service}", money(price.service))}
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
