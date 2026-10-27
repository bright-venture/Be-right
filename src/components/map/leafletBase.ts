import L from "leaflet";
import "leaflet/dist/leaflet.css";

/** OpenFreeMap's "Bright" style: free, commercial use allowed, no key (openfreemap.org). */
const STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Drawing the style needs WebGL; the rare phone without it gets plain OpenStreetMap images. */
function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * The map itself, drawn by MapLibre inside Leaflet (pins, zoom and taps stay Leaflet's),
 * loaded with the first map so other pages don't carry it.
 * The credit line keeps only what the map's licence requires (OpenFreeMap, OpenMapTiles,
 * OpenStreetMap): no "Leaflet" and no flag.
 */
export function addBaseTiles(map: L.Map) {
  map.attributionControl?.setPrefix(false);
  const plain = () => L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: OSM_CREDIT }).addTo(map);
  if (!hasWebGL()) {
    plain();
    return;
  }
  let removed = false;
  map.once("unload", () => (removed = true));
  import("./glLayer")
    .then(({ addGlLayer }) => {
      if (!removed) addGlLayer(map, STYLE_URL);
    })
    .catch(() => {
      if (!removed) plain();
    });
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
