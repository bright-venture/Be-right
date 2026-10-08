import { useEffect, useRef, useState } from "react";
import { CLIENTS } from "@contracts/services";
import { useI18n } from "@/i18n";

/**
 * Client logos scrolling sideways. They stop while off screen or in a background tab, while the
 * mouse is over them (index.css), and for visitors who ask their
 * device for less motion (then they simply sit in rows).
 */
export function ClientCarousel() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", updateVisibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.1 });
    if (root.current) observer.observe(root.current);
    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={root} className="client-logo-row mt-8" role="region" aria-label={isAr ? "شعارات زبائننا" : "Our client logos"}>
      <div className="overflow-hidden border-y border-navy/15 py-5" dir="ltr">
        <div className="client-logo-track" style={{ animationPlayState: !visible || !pageVisible ? "paused" : "running", animationDirection: isAr ? "reverse" : "normal" }}>
          {[0, 1].map(copy => CLIENTS.map(client => (
            <div key={`${copy}-${client.name}`} className={`client-logo-item ${copy ? "client-logo-copy" : ""}`} aria-hidden={copy ? true : undefined} dir={isAr ? "rtl" : "ltr"}>
              <div className="flex h-20 items-center justify-center bg-white px-5 py-4">
                <img src={client.logo} alt={copy ? "" : client.name} loading="lazy" decoding="async" className="h-10 w-full max-w-28 object-contain" draggable={false} />
              </div>
            </div>
          )))}
        </div>
      </div>
    </div>
  );
}
