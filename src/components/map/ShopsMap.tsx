import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n";
import { addBaseTiles, L, pinIcon } from "./leafletBase";

type Point = { lat: number; lng: number };
type Shop = Point & { id: number; name: string };

/** The job (orange house pin) and partner parts shops (navy wrench pins), all in view. */
export default function ShopsMap({ home, shops, className = "h-56 w-full sm:h-64" }: { home: Point | null; shops: Shop[]; className?: string }) {
  const { t, p } = useI18n();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { scrollWheelZoom: false });
    addBaseTiles(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  const key = `${home ? `${home.lat},${home.lng}` : ""}|${shops.map((s) => `${s.id}:${s.lat},${s.lng}`).join(";")}`;

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const points: L.LatLngExpression[] = [];
    if (home) {
      L.marker([home.lat, home.lng], { icon: pinIcon("home"), title: p(t.map.home) }).addTo(g);
      points.push([home.lat, home.lng]);
    }
    for (const s of shops) {
      L.marker([s.lat, s.lng], { icon: pinIcon("shop"), title: s.name }).bindTooltip(s.name).addTo(g);
      points.push([s.lat, s.lng]);
    }
    if (points.length === 1) m.setView(points[0], 15);
    else if (points.length > 1) m.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <div ref={el} role="img" aria-label={p(t.parts.mapLabel)} className={`overflow-hidden rounded-2xl border-2 border-navy/20 ${className}`} />;
}
