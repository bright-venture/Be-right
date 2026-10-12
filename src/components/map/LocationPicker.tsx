import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { WORLD_VIEW, isValidPin } from "@contracts/geo";
import { addBaseTiles, L, pinIcon } from "./leafletBase";

export type Pin = { lat: number; lng: number };

/**
 * Map where the customer drops a pin on their address: tap the map, drag the pin,
 * or use the phone's location.
 */
export default function LocationPicker({
  value,
  onChange,
}: {
  value: Pin | null;
  onChange: (pin: Pin) => void;
}) {
  const { t, p } = useI18n();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Create the map once.
  useEffect(() => {
    if (!el.current || map.current) return;
    // The customer's pin if there is one; otherwise the world, then their own area if the browser
    // already allows location (no permission prompt before they ask for it).
    const m = L.map(el.current, { scrollWheelZoom: false }).setView(
      value ? [value.lat, value.lng] : [WORLD_VIEW.lat, WORLD_VIEW.lng],
      value ? 17 : WORLD_VIEW.zoom,
    );
    if (!value && "permissions" in navigator && "geolocation" in navigator) {
      void navigator.permissions
        .query({ name: "geolocation" })
        .then((state) => {
          if (state.state !== "granted") return;
          navigator.geolocation.getCurrentPosition((pos) => {
            if (map.current === m) m.setView([pos.coords.latitude, pos.coords.longitude], 15);
          });
        })
        .catch(() => {});
    }
    addBaseTiles(m);
    m.on("click", (e: L.LeafletMouseEvent) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the pin in sync with the chosen location.
  useEffect(() => {
    const m = map.current;
    if (!m || !value) return;
    if (!marker.current) {
      marker.current = L.marker([value.lat, value.lng], { draggable: true, icon: pinIcon("home") }).addTo(m);
      marker.current.on("dragend", () => {
        const ll = marker.current!.getLatLng();
        onChangeRef.current({ lat: ll.lat, lng: ll.lng });
      });
    } else {
      marker.current.setLatLng([value.lat, value.lng]);
    }
  }, [value]);

  function useMyLocation() {
    setError(null);
    if (!("geolocation" in navigator)) return setError(p(t.map.geoUnavailable));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const pin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!isValidPin(pin.lat, pin.lng)) return setError(p(t.map.geoUnavailable));
        onChangeRef.current(pin);
        map.current?.setView([pin.lat, pin.lng], 17);
      },
      () => {
        setLocating(false);
        setError(p(t.map.geoUnavailable));
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <div>
      <div
        ref={el}
        role="application"
        aria-label={p(t.map.pickerLabel)}
        className="h-64 w-full overflow-hidden rounded-2xl border-2 border-navy/30 sm:h-72"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={useMyLocation} disabled={locating} className="btn-pill-outline !min-h-11 !py-2 text-sm">
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
          {p(t.map.useMyLocation)}
        </button>
        <p className="text-xs text-navy/70">{value ? p(t.map.dragHint) : p(t.map.tapHint)}</p>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
