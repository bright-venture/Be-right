// Which district a map pin is in (contracts/districts.ts). Outlines from HDX COD-AB Lebanon
// (CDR, CC BY-IGO), simplified to about 80 m (server/data/lebanon-districts.json).
import { TRPCError } from "@trpc/server";
import outlines from "../data/lebanon-districts.json";
import { worksIn, type District } from "@contracts/districts";
import type { Role } from "@contracts/roles";

type Ring = [number, number][]; // [lng, lat]
const DISTRICT_OUTLINES = outlines as unknown as { id: District; rings: Ring[] }[];

/** A pin just off a simplified outline (a seafront building, a border street) still counts. */
const NEAREST_KM = 3;

function inRing(lng: number, lat: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance in km from a point to a segment (flat-earth: fine over a few km). */
function kmToSegment(lng: number, lat: number, a: [number, number], b: [number, number]) {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ky = 110.57;
  const [px, py] = [lng * kx, lat * ky];
  const [ax, ay, bx, by] = [a[0] * kx, a[1] * ky, b[0] * kx, b[1] * ky];
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** The district of a map pin, or null outside Lebanon (or with no pin). */
export function districtAt(lat: number | null | undefined, lng: number | null | undefined): District | null {
  if (lat == null || lng == null) return null;
  // Even-odd over all of a district's rings handles its islands and holes.
  for (const d of DISTRICT_OUTLINES) {
    let inside = false;
    for (const ring of d.rings) if (inRing(lng, lat, ring)) inside = !inside;
    if (inside) return d.id;
  }
  let best: { id: District; km: number } | null = null;
  for (const d of DISTRICT_OUTLINES) {
    for (const ring of d.rings) {
      for (let i = 1; i < ring.length; i++) {
        const km = kmToSegment(lng, lat, ring[i - 1], ring[i]);
        if (km < NEAREST_KM && (!best || km < best.km)) best = { id: d.id, km };
      }
    }
  }
  return best?.id ?? null;
}

/** A request's district: saved when it was booked, else from its pin (older requests). */
export function requestDistrict(row: { district?: string | null; lat: number | null; lng: number | null }) {
  return (row.district as District | null | undefined) ?? districtAt(row.lat, row.lng);
}

/**
 * A technician only works in their districts. Specialists can't send them elsewhere; an admin
 * can, for an exception (returns true then, so the request's history says so).
 */
export function checkWorksIn(role: Role, districts: readonly string[], district: string | null) {
  if (worksIn(districts, district)) return false;
  if (role !== "admin") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This technician doesn't work in this district" });
  }
  return true;
}

/** The note added to the request's history when an admin makes an exception. */
export const OUTSIDE_DISTRICTS_NOTE = "outside their districts (admin exception)";
