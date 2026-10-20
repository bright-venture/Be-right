import { lazy, Suspense, useState } from "react";
import { ChevronDown, Clock, Loader2, Phone, Wrench } from "lucide-react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { telLink } from "@/lib/contact";
import { DirectionsLinks } from "@/components/map/DirectionsLinks";
import { distanceKm } from "@contracts/geo";
import { OTHER_SERVICE } from "@contracts/services";

const ShopsMap = lazy(() => import("@/components/map/ShopsMap"));

/** How many shops the list shows, nearest first (every one of them is on the map). */
const LIST_LIMIT = 5;

/**
 * Partner parts shops for one job, nearest to the job first: the ones that supply its trade
 * (a shop with no trades listed supplies every trade; an "Other" job sees every shop). The technician takes the part for free
 * under Be Right's agreement with the shop; nothing is paid or recorded in the app.
 */
export function PartsShopsNearJob({ trade, home }: { trade: string; home: { lat: number; lng: number } | null }) {
  const { t, p, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const shops = trpc.shops.list.useQuery(undefined, { enabled: open, staleTime: 5 * 60_000 });
  const forTrade = (shops.data ?? [])
    .filter((s) => trade === OTHER_SERVICE || s.trades.length === 0 || s.trades.includes(trade))
    .map((s) => ({ ...s, km: home ? distanceKm(home, s) : null }))
    .sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
  const km = (n: number) =>
    p(t.parts.km).replace("{n}", n.toLocaleString(lang === "ar" ? "ar" : "en-GB", { maximumFractionDigits: n < 10 ? 1 : 0 }));

  return (
    <div className="rounded-2xl border-2 border-navy/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-start text-sm font-bold text-navy"
      >
        <Wrench className="h-4 w-4 shrink-0 text-bird" />
        <span className="flex-1">{p(t.parts.nearJob)}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t-2 border-navy/10 p-4">
          <p className="text-xs text-navy/70">{p(t.parts.nearJobHint)}</p>
          {shops.isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-navy" />
          ) : forTrade.length === 0 ? (
            <p className="text-sm font-semibold text-navy/70">{p(t.parts.none)}</p>
          ) : (
            <>
              <Suspense fallback={<div className="h-56 rounded-2xl bg-navy/5 sm:h-64" />}>
                <ShopsMap home={home} shops={forTrade} />
              </Suspense>
              <ul className="flex flex-col divide-y divide-navy/10">
                {forTrade.slice(0, LIST_LIMIT).map((s) => (
                  <li key={s.id} className="flex flex-col gap-2 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-display text-sm font-extrabold text-navy">{s.name}</span>
                      {s.km !== null && <span className="shrink-0 text-xs font-bold text-navy/70">{km(s.km)}</span>}
                    </div>
                    <p className="text-xs text-navy/70">{s.address}</p>
                    {s.hours && (
                      <p className="flex items-center gap-1 text-xs text-navy/70">
                        <Clock className="h-3.5 w-3.5 shrink-0" /> {s.hours}
                      </p>
                    )}
                    {s.note && <p className="rounded-lg bg-navy/5 px-3 py-2 text-xs text-navy/80">{s.note}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={telLink(s.phone)} className="btn-pill-outline !min-h-10 !px-4 !py-1.5 text-xs">
                        <Phone className="h-4 w-4" /> {p(t.parts.call)} <span dir="ltr">{s.phone}</span>
                      </a>
                      <DirectionsLinks lat={s.lat} lng={s.lng} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
