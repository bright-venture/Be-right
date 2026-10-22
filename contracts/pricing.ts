// Fixed prices (Admin → Prices). When a specialist prices a request, each technician gets a
// suggested price:
//
//   service price + travel (rate per km for their transport × distance)
//
// The distance runs from the technician's starting point to the customer's pin, straight
// line × ROAD_FACTOR, one way: that alone accounts for where the customer is. The total is
// rounded up to a whole dollar and never goes below the minimum (at least the visit fee).
// The specialist can still change it before sending; the customer only sees the total.
import type { Transport } from "./applications";
import { VISIT_FEE_USD } from "./legal";

/** Roads are longer than a straight line: straight-line km × this ≈ km by road. */
export const ROAD_FACTOR = 1.3;

/** What admins set. A missing amount means "not set yet". */
export interface PricingSettings {
  /** USD per service id. */
  services: Partial<Record<string, number>>;
  /**
   * Per transport: USD per km by road, and the max distance (km by road) to a customer;
   * further away, the technician is marked "too far". null = no limit.
   */
  transport: Partial<Record<Transport, { perKm: number | null; maxKm: number | null }>>;
  /** The lowest price suggested (never below the visit fee). */
  minimum: number | null;
}

export const EMPTY_PRICING: PricingSettings = { services: {}, transport: {}, minimum: null };

/** Highest amount accepted anywhere in the table, in USD. */
export const MAX_PRICE_USD = 100_000;

export function lowestPrice(settings: PricingSettings) {
  return Math.max(settings.minimum ?? 0, VISIT_FEE_USD);
}

/** Why a suggestion is incomplete. */
export type PriceGap = "service" | "start" | "transport";

export interface PriceBreakdown {
  service: number | null;
  /** Travel in USD, or null when the distance or the rate is unknown. */
  travel: number | null;
  /** Km by road, one way. */
  roadKm: number | null;
  perKm: number | null;
  /** Rounded up, at least the minimum; null without a service price. */
  total: number | null;
  /** Further than the max distance for their transport. */
  tooFar: boolean;
  gaps: PriceGap[];
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function suggestPrice(
  settings: PricingSettings,
  job: { category: string },
  tech: { transport: Transport | null; straightKm: number | null },
): PriceBreakdown {
  const gaps: PriceGap[] = [];
  const service = settings.services[job.category] ?? null;
  if (service == null) gaps.push("service");
  if (tech.straightKm == null) gaps.push("start");
  const rule = tech.transport ? settings.transport[tech.transport] : undefined;
  const perKm = rule?.perKm ?? null;
  if (perKm == null) gaps.push("transport");
  const roadKm = tech.straightKm == null ? null : Math.round(tech.straightKm * ROAD_FACTOR * 10) / 10;
  const travel = perKm != null && roadKm != null ? cents(perKm * roadKm) : null;
  const maxKm = rule?.maxKm ?? null;
  const total = service == null ? null : Math.max(lowestPrice(settings), Math.ceil(cents(service + (travel ?? 0))));
  return { service, travel, roadKm, perKm, total, tooFar: roadKm != null && maxKm != null && roadKm > maxKm, gaps };
}
