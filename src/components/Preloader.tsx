import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { removeStudioBackground } from "@/lib/matte";
import { INTRO_DONE_EVENT } from "@/lib/intro";

const FADE_MS = 450;

export function Preloader({ onDone }: { onDone: () => void }) {
  const { p, t } = useI18n();
  const [leaving, setLeaving] = useState(false);
  // Every frame has its studio background removed pixel by pixel (on a background thread):
  // phones, which show the intro smaller anyway, get 2.5x fewer pixels to process.
  const [frameSize] = useState(() => (window.innerWidth < 640 ? { w: 480, h: 270 } : { w: 768, h: 432 }));
  const done = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const runner = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  /** A frame is being cleaned on the background thread: don't queue another. */
  const busy = useRef(false);
  /** Where each video frame is grabbed; only cleaned frames reach the visible canvas. */
  const scratch = useRef<HTMLCanvasElement | null>(null);
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
    // The clip runs in place until its final dash. Move that run across the viewport
    // (every display frame, so the motion stays smooth while a frame is being cleaned).
    const progress = Math.min(1, Math.max(0, (element.currentTime - 2.5) / 6.5));
    if (runner.current) runner.current.style.transform = `translateX(${-65 + progress * 130}vw)`;
    if (!busy.current && timestamp - lastDraw >= 33 && element.readyState >= 2) {
      if (!scratch.current) {
        scratch.current = document.createElement("canvas");
        scratch.current.width = output.width;
        scratch.current.height = output.height;
      }
      const grab = scratch.current.getContext("2d", { willReadFrequently: true });
      const show = output.getContext("2d");
      if (!grab || !show) { finish(); return; }
      try {
        grab.drawImage(element, 0, 0, output.width, output.height);
        const image = grab.getImageData(0, 0, output.width, output.height);
        busy.current = true;
        void removeStudioBackground(image).then((clean) => {
          busy.current = false;
          if (clean && !done.current) show.putImageData(clean, 0, 0);
        });
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
      {/* A soft glow behind the running bird. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <span className="h-[60vh] w-[60vh] max-w-[90vw] rounded-full bg-[#123C7E] opacity-40 blur-3xl" />
      </div>
      <div className="relative flex h-full flex-col items-center justify-center px-4">
        <video ref={video} src="/assets/bird-intro.mp4" poster="/assets/bird-intro-poster.jpg" muted playsInline preload="auto"
          onCanPlay={play} onEnded={finish} onError={finish} aria-hidden="true" className="sr-only" />
        <div ref={runner} className="flex w-[100vw] max-w-5xl flex-col items-center will-change-transform" style={{ transform: "translateX(-65vw)" }}>
          <canvas ref={canvas} width={frameSize.w} height={frameSize.h} className="w-full max-h-[65vh] object-contain" role="img" aria-label={p(t.preloader.slogan)} />
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
