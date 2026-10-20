import L from "leaflet";
import "leaflet/dist/leaflet.css";

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/**
 * Map images. OpenStreetMap's own tile servers are free but meant for light use only;
 * with VITE_MAPTILER_KEY set, MapTiler serves them instead (free plan: 100,000 tiles a
 * month). Attribution is required by both.
 */
export function addBaseTiles(map: L.Map) {
  if (MAPTILER_KEY) {
    L.tileLayer(`https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${encodeURIComponent(MAPTILER_KEY)}`, {
      maxZoom: 19,
      attribution: `<a href="https://www.maptiler.com/copyright/">&copy; MapTiler</a> ${OSM_CREDIT}`,
    }).addTo(map);
    return;
  }
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: OSM_CREDIT }).addTo(map);
}

/** Brand-coloured pins drawn with HTML, so no marker image files are needed. */
export function pinIcon(kind: "home" | "tech" | "shop", label?: string) {
  const color = kind === "home" ? "#F45309" : kind === "shop" ? "#0C2B5C" : "#0B63CE";
  const inner =
    kind === "home"
      ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.5"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>`
      : kind === "shop"
        ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>`
        : `<span style="color:#fff;font:700 12px/1 Arial">${label ?? ""}</span>`;
  return L.divIcon({
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div style="width:34px;height:34px;border-radius:999px;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(12,43,92,.45);display:flex;align-items:center;justify-content:center">${inner}</div>`,
  });
}

export { L };
