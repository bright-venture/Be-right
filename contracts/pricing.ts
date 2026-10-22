// Fixed prices (Admin → Prices). When a specialist prices a request, each technician gets a
// suggested price:
//
//   service price + region extra + travel (rate per km for their transport × distance)
//
// The distance runs from the technician's starting point to the customer's pin, straight
// line × ROAD_FACTOR, one way. The total is rounded up to a whole dollar and never goes
// below the minimum (at least the visit fee). The specialist can still change it before
// sending; the customer only sees the total.
import type { LocalText } from "./services";
import type { Transport } from "./applications";
import { VISIT_FEE_USD } from "./legal";

/** Lebanon's 8 governorates: the customer picks one when booking. */
export const REGIONS = ["beirut", "mount_lebanon", "north", "akkar", "bekaa", "baalbek_hermel", "south", "nabatieh"] as const;
export type Region = (typeof REGIONS)[number];

export const REGION_LABELS: Record<Region, LocalText> = {
  beirut: { en: "Beirut", ar: "بيروت" },
  mount_lebanon: { en: "Mount Lebanon", ar: "جبل لبنان" },
  north: { en: "North", ar: "الشمال" },
  akkar: { en: "Akkar", ar: "عكار" },
  bekaa: { en: "Bekaa", ar: "البقاع" },
  baalbek_hermel: { en: "Baalbek-Hermel", ar: "بعلبك الهرمل" },
  south: { en: "South", ar: "الجنوب" },
  nabatieh: { en: "Nabatieh", ar: "النبطية" },
};

export function isRegion(value: unknown): value is Region {
  return typeof value === "string" && (REGIONS as readonly string[]).includes(value);
}

/** Roads are longer than a straight line: straight-line km × this ≈ km by road. */
export const ROAD_FACTOR = 1.3;

/** What admins set. A missing amount means "not set yet" (a region with no extra adds $0). */
export interface PricingSettings {
  /** USD per service id. */
  services: Partial<Record<string, number>>;
  /** USD added for a customer in that region. */
  regions: Partial<Record<Region, number>>;
  /** Per transport: USD per km by road, and how far (km by road) they go; null = no limit. */
  transport: Partial<Record<Transport, { perKm: number | null; maxKm: number | null }>>;
  /** The lowest price suggested (never below the visit fee). */
  minimum: number | null;
}

export const EMPTY_PRICING: PricingSettings = { services: {}, regions: {}, transport: {}, minimum: null };

/** Highest amount accepted anywhere in the table, in USD. */
export const MAX_PRICE_USD = 100_000;

export function lowestPrice(settings: PricingSettings) {
  return Math.max(settings.minimum ?? 0, VISIT_FEE_USD);
}

/** Why a suggestion is incomplete. */
export type PriceGap = "service" | "region" | "start" | "transport";

export interface PriceBreakdown {
  service: number | null;
  region: number;
  /** Travel in USD, or null when the distance or the rate is unknown. */
  travel: number | null;
  /** Km by road, one way. */
  roadKm: number | null;
  perKm: number | null;
  /** Rounded up, at least the minimum; null without a service price. */
  total: number | null;
  /** Further than their transport goes. */
  tooFar: boolean;
  gaps: PriceGap[];
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function suggestPrice(
  settings: PricingSettings,
  job: { category: string; region: Region | null },
  tech: { transport: Transport | null; straightKm: number | null },
): PriceBreakdown {
  const gaps: PriceGap[] = [];
  const service = settings.services[job.category] ?? null;
  if (service == null) gaps.push("service");
  if (!job.region) gaps.push("region");
  const region = job.region ? (settings.regions[job.region] ?? 0) : 0;
  if (tech.straightKm == null) gaps.push("start");
  const rule = tech.transport ? settings.transport[tech.transport] : undefined;
  const perKm = rule?.perKm ?? null;
  if (perKm == null) gaps.push("transport");
  const roadKm = tech.straightKm == null ? null : Math.round(tech.straightKm * ROAD_FACTOR * 10) / 10;
  const travel = perKm != null && roadKm != null ? cents(perKm * roadKm) : null;
  const maxKm = rule?.maxKm ?? null;
  const total =
    service == null ? null : Math.max(lowestPrice(settings), Math.ceil(cents(service + region + (travel ?? 0))));
  return { service, region, travel, roadKm, perKm, total, tooFar: roadKm != null && maxKm != null && roadKm > maxKm, gaps };
}
