// MapLibre (about 0.5 MB) in its own file, loaded by leafletBase.ts only once a map shows.
import type L from "leaflet";
import { setWorkerUrl } from "maplibre-gl";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre draws in a background worker. Vite builds it into one file and gives its address;
// left to find it alone, it looks next to a repackaged copy and fails to load.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);

export function addGlLayer(map: L.Map, style: string) {
  return maplibreGL({ style }).addTo(map);
}
