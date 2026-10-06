import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { CLIENTS } from "@contracts/services";
import { useI18n } from "@/i18n";

export function ClientCarousel() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(media.matches);
    const updateVisibility = () => setPageVisible(!document.hidden);
    media.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.1 });
    if (root.current) observer.observe(root.current);
    return () => {
      media.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={root} className="client-logo-row mt-8" role="region" aria-label={isAr ? "شعارات زبائننا" : "Our client logos"}>
      <div className="overflow-hidden border-y border-navy/15 py-5" dir="ltr">
        <div className="client-logo-track" style={{ animationPlayState: paused || !visible || !pageVisible ? "paused" : "running", animationDirection: isAr ? "reverse" : "normal" }}>
          {[0, 1].map(copy => CLIENTS.map(client => (
            <div key={`${copy}-${client.name}`} className={`client-logo-item ${copy ? "client-logo-copy" : ""}`} aria-hidden={copy ? true : undefined} dir={isAr ? "rtl" : "ltr"}>
              <div className="flex h-20 items-center justify-center bg-white px-5 py-4">
                <img src={client.logo} alt={copy ? "" : client.name} loading="lazy" decoding="async" className="h-10 w-full max-w-28 object-contain" draggable={false} />
              </div>
            </div>
          )))}
        </div>
      </div>
      {!reducedMotion && <div className="mt-4 flex justify-center">
        <button type="button" onClick={() => setPaused(current => !current)} className="flex min-h-11 items-center gap-2 rounded-full border border-navy/20 px-4 text-xs font-bold text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-flame"
          aria-label={paused ? (isAr ? "تشغيل التمرير" : "Play logo scrolling") : (isAr ? "إيقاف التمرير" : "Pause logo scrolling")}>
          {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
          {paused ? (isAr ? "تشغيل" : "Play") : (isAr ? "إيقاف" : "Pause")}
        </button>
      </div>}
    </div>
  );
}
