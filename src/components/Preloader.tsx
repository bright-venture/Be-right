import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { refineBirdMatte } from "@/lib/birdMatte";
import { INTRO_DONE_EVENT } from "@/lib/intro";

/**
 * Accurate silhouette of Lebanon — coastline and proportions preserved.
 * Source: geoBoundaries ADM0 (public domain), north-up, viewBox 0 0 640 838.2.
 */
export const LEBANON_PATH =
  "M540.4,31.2 L527.4,19.6 L525.0,15.6 L527.3,6.7 L519.7,0.0 L507.7,6.7 L505.0,14.8 L507.4,19.7 L503.2,29.2 L490.2,33.8 L481.3,30.2 L473.1,34.6 L458.2,28.7 L450.8,33.8 L430.2,25.6 L417.3,32.4 L412.4,30.0 L409.3,32.9 L404.8,29.1 L400.1,33.2 L393.5,33.1 L381.0,24.2 L370.5,21.6 L367.6,31.7 L374.1,53.0 L374.2,74.2 L370.4,86.3 L354.5,94.1 L338.8,113.8 L315.7,120.6 L297.2,120.5 L295.4,124.6 L296.8,133.8 L300.9,138.4 L299.5,146.0 L282.9,157.5 L267.2,161.2 L256.9,197.2 L253.1,198.1 L246.8,193.7 L241.2,196.0 L231.8,212.7 L234.3,231.1 L230.2,243.8 L223.3,253.5 L223.0,271.2 L219.6,278.3 L225.9,285.3 L226.4,291.9 L229.8,295.9 L230.0,308.8 L217.8,342.1 L226.2,348.4 L226.6,355.3 L223.6,360.6 L216.0,360.7 L210.1,368.2 L200.8,395.8 L194.5,403.8 L188.1,405.7 L169.6,400.2 L155.9,402.9 L152.9,406.2 L158.5,423.9 L157.0,458.3 L144.3,483.1 L139.7,507.4 L130.2,513.4 L131.2,527.3 L124.0,535.5 L123.6,550.2 L118.5,556.2 L118.3,564.1 L110.6,576.7 L105.8,599.9 L87.8,623.3 L76.1,630.1 L71.5,639.8 L63.0,664.1 L57.9,696.0 L48.9,708.5 L45.2,722.0 L37.9,723.4 L38.0,727.9 L43.7,733.7 L44.2,749.3 L35.3,775.2 L31.0,780.9 L25.1,781.6 L15.9,800.2 L2.6,808.0 L0.0,816.6 L20.4,818.9 L21.0,821.4 L29.8,817.3 L38.8,822.0 L45.9,813.9 L56.9,818.4 L79.8,811.6 L84.6,815.5 L91.0,814.8 L93.6,818.8 L92.4,822.7 L100.3,833.8 L113.8,838.2 L117.3,835.0 L138.1,832.6 L147.4,818.5 L169.0,819.3 L168.7,806.9 L175.7,806.1 L179.5,799.3 L178.9,790.9 L185.5,763.9 L182.7,750.6 L195.4,718.2 L200.4,718.8 L204.5,729.6 L220.7,741.8 L217.8,733.6 L218.8,725.9 L227.9,721.9 L235.8,723.7 L255.2,708.9 L260.5,697.4 L272.1,698.5 L299.8,682.4 L299.9,674.4 L305.2,661.4 L351.2,628.7 L355.4,618.0 L351.2,613.8 L348.8,604.9 L354.2,595.9 L363.9,591.3 L364.7,586.5 L372.2,583.9 L378.1,589.2 L382.8,586.1 L387.6,587.6 L402.6,569.3 L396.2,557.2 L386.3,549.0 L368.4,541.0 L368.4,537.2 L360.0,539.8 L351.5,537.1 L350.7,532.3 L354.9,521.6 L362.6,518.2 L360.4,512.0 L363.3,508.5 L349.0,496.1 L373.9,483.1 L381.4,469.8 L388.9,472.9 L402.1,448.8 L422.2,442.2 L424.2,434.1 L433.6,437.5 L439.4,424.6 L451.5,434.1 L457.6,432.3 L465.2,439.3 L471.6,429.9 L476.5,432.2 L478.9,425.6 L494.6,428.8 L511.2,437.2 L541.2,437.0 L544.0,431.6 L538.2,425.9 L536.1,416.7 L528.2,405.2 L502.9,407.0 L496.4,410.6 L488.9,406.4 L513.9,369.0 L520.3,365.6 L525.0,357.8 L529.7,359.2 L537.6,347.6 L540.7,336.4 L545.8,336.7 L545.6,330.7 L548.4,327.5 L553.0,329.1 L556.6,324.0 L561.2,323.4 L577.2,329.8 L586.5,325.7 L592.8,312.8 L590.4,302.2 L606.7,284.8 L614.4,282.3 L625.1,259.5 L640.0,249.0 L637.9,234.7 L627.4,217.0 L626.3,208.8 L628.5,202.8 L612.3,194.1 L615.1,185.8 L609.3,180.3 L602.3,165.5 L613.6,151.4 L615.5,138.3 L595.4,129.9 L587.6,121.7 L590.6,117.6 L576.7,117.9 L572.3,109.8 L563.5,109.7 L567.9,95.3 L554.6,92.4 L544.3,99.3 L526.2,94.4 L541.7,75.7 L551.5,71.3 L552.2,65.4 L546.3,59.8 L548.7,43.0 L552.7,41.9 L561.2,51.0 L568.2,51.5 L572.5,42.6 L570.2,35.3 L573.8,29.0 L566.0,28.5 L556.7,34.3 L547.1,28.5 L540.4,31.2 Z";

/* Beirut (35.5018, 33.8938) projected into the same viewBox. */
const BEIRUT = { x: 167.1, y: 407.8 };

const FADE_MS = 450;

export function Preloader({ onDone }: { onDone: () => void }) {
  const { p, t } = useI18n();
  const [leaving, setLeaving] = useState(false);
  const done = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const runner = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const timers = useRef<number[]>([]);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const finish = () => {
    if (done.current) return;
    done.current = true;
    video.current?.pause();
    window.cancelAnimationFrame(frame.current);
    // This video owns the entrance: reveal the hero without another bird run.
    window.dispatchEvent(new Event(INTRO_DONE_EVENT));
    setLeaving(true);
    timers.current.push(window.setTimeout(() => onDoneRef.current(), FADE_MS));
  };

  useEffect(() => {
    done.current = false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    // Never let a stalled download prevent access to the website.
    timers.current.push(window.setTimeout(finish, 8000));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
      window.cancelAnimationFrame(frame.current);
    };
  }, []);

  // Composite the supplied white-studio video over navy at a modest resolution.
  // Only neutral near-white pixels are keyed; blue feathers and orange clothing stay intact.
  const draw = (timestamp: number, lastDraw = 0) => {
    if (done.current) return;
    const element = video.current;
    const output = canvas.current;
    if (!element || !output) return;
    if (timestamp - lastDraw >= 33 && element.readyState >= 2) {
      const context = output.getContext("2d", { willReadFrequently: true });
      if (!context) { finish(); return; }
      try {
        context.drawImage(element, 0, 0, output.width, output.height);
        const image = context.getImageData(0, 0, output.width, output.height);
        refineBirdMatte(image);
        context.putImageData(image, 0, 0);
        // The clip runs in place until its final dash. Move that run across the viewport.
        const progress = Math.min(1, Math.max(0, (element.currentTime - 2.5) / 6.5));
        if (runner.current) runner.current.style.transform = `translateX(${-65 + progress * 130}vw)`;
        lastDraw = timestamp;
      } catch { finish(); return; }
    }
    frame.current = window.requestAnimationFrame(next => draw(next, lastDraw));
  };

  const play = () => {
    const element = video.current;
    if (!element || done.current) return;
    // Start at the running pose, then use the clip's natural dash and exit.
    if (element.currentTime < 2.5) element.currentTime = 2.5;
    element.playbackRate = 2.5;
    element.play().then(() => {
      window.cancelAnimationFrame(frame.current);
      frame.current = window.requestAnimationFrame(timestamp => draw(timestamp));
    }).catch(() => {
      timers.current.push(window.setTimeout(finish, 1500));
    });
  };

  return (
    <div data-intro role="dialog" aria-modal="true" aria-label={p(t.preloader.slogan)}
      style={{ transitionDuration: `${FADE_MS}ms` }}
      className={`fixed inset-0 z-[100] overflow-hidden bg-navy-deep transition-opacity ${leaving ? "pointer-events-none opacity-0" : "opacity-100"}`}>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 640 838.2" preserveAspectRatio="xMidYMid meet" className="h-[70vh] w-auto opacity-30" aria-hidden="true">
          <path d={LEBANON_PATH} fill="#123C7E" stroke="#F4530A" strokeWidth="8" strokeLinejoin="round" />
          <circle cx={BEIRUT.x} cy={BEIRUT.y} r="14" fill="#F4530A" />
        </svg>
      </div>
      <div className="relative flex h-full flex-col items-center justify-center px-4">
        <video ref={video} src="/assets/bird-intro.mp4" poster="/assets/bird-intro-poster.jpg" muted playsInline preload="auto"
          onCanPlay={play} onEnded={finish} onError={finish} aria-hidden="true" className="sr-only" />
        <div ref={runner} className="flex w-[100vw] max-w-5xl flex-col items-center will-change-transform" style={{ transform: "translateX(-65vw)" }}>
          <canvas ref={canvas} width={768} height={432} className="w-full max-h-[65vh] object-contain" role="img" aria-label={p(t.preloader.slogan)} />
        <div className="relative -mt-2 rounded-2xl border-2 border-navy bg-white px-6 py-3 shadow-[0_4px_0_rgb(12_43_92/0.15)] sm:-mt-6">
          <p className="font-display text-2xl font-black text-navy sm:text-4xl">{p(t.preloader.slogan)}</p>
          <span aria-hidden="true" className="absolute -top-[7px] start-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-s-2 border-t-2 border-navy bg-white" />
        </div>
        </div>
      </div>
      <button type="button" autoFocus onClick={finish} className="btn-pill-white absolute end-4 top-4 px-5 py-2.5 font-display text-sm font-black uppercase tracking-wide sm:end-6 sm:top-6">
        {p(t.preloader.skip)}
      </button>
    </div>
  );
}
