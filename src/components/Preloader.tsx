import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { INTRO_DONE_EVENT } from "@/lib/intro";
import birdRun from "@/lib/birdRun.json";

const FADE_MS = 450;
/** The clip is played at this speed (it was filmed slower than the intro should feel). */
const SPEED = 2.5;
/** Never let a slow download keep anyone from the website. */
const GIVE_UP_MS = 8000;

/**
 * The bird's run, already cut out of its white studio background and packed into one
 * picture (scripts/make-bird-run.mjs). Playing it is only flipping through frames, so the
 * legs run at full speed on every phone, with no video to load or frames to process.
 */
export function Preloader({ onDone }: { onDone: () => void }) {
  const { p, t } = useI18n();
  const [leaving, setLeaving] = useState(false);
  // Phones get the lighter picture: it is decoded whole into memory.
  const [sprite] = useState(() => (window.innerWidth < 640 ? { ...birdRun.sm, src: "/assets/bird-run-sm.webp" } : { ...birdRun.lg, src: "/assets/bird-run-lg.webp" }));
  const done = useRef(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const runner = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const timers = useRef<number[]>([]);
  /** Ends the intro (the Skip button too); set by the effect below. */
  const finishRef = useRef(() => {});
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    done.current = false;
    const finish = () => {
      if (done.current) return;
      done.current = true;
      window.cancelAnimationFrame(frame.current);
      // This run owns the entrance: reveal the hero without another bird run.
      window.dispatchEvent(new Event(INTRO_DONE_EVENT));
      setLeaving(true);
      timers.current.push(window.setTimeout(() => onDoneRef.current(), FADE_MS));
    };
    finishRef.current = finish;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    timers.current.push(window.setTimeout(finish, GIVE_UP_MS));

    const sheet = new Image();
    const run = () => {
      const output = canvas.current?.getContext("2d");
      if (done.current || !output) return;
      const duration = ((sprite.frames - 1) * birdRun.step * 1000) / SPEED;
      const began = performance.now();
      let shown = -1;
      const step = (now: number) => {
        if (done.current) return;
        const progress = Math.min(1, (now - began) / duration);
        // The bird runs on the spot in the clip: move it across the screen as it runs.
        if (runner.current) runner.current.style.transform = `translateX(${-65 + progress * 130}vw)`;
        const index = Math.min(sprite.frames - 1, Math.floor(progress * (sprite.frames - 1)));
        if (index !== shown) {
          shown = index;
          const { frameWidth: w, frameHeight: h, columns, crop } = sprite;
          output.clearRect(0, 0, sprite.videoWidth, sprite.videoHeight);
          output.drawImage(sheet, (index % columns) * w, Math.floor(index / columns) * h, w, h, crop[0], crop[1], w, h);
        }
        if (progress < 1) frame.current = window.requestAnimationFrame(step);
        else finish();
      };
      frame.current = window.requestAnimationFrame(step);
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
    else {
      sheet.onerror = finish;
      // Decoded before the first frame, so the run doesn't stutter at the start.
      sheet.onload = () => void sheet.decode().catch(() => undefined).then(run);
      sheet.src = sprite.src;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
      window.cancelAnimationFrame(frame.current);
      sheet.onload = sheet.onerror = null;
    };
  }, [sprite]);

  return (
    <div data-intro role="dialog" aria-modal="true" aria-label={p(t.preloader.slogan)}
      style={{ transitionDuration: `${FADE_MS}ms` }}
      className={`fixed inset-0 z-[100] overflow-hidden bg-navy-deep transition-opacity ${leaving ? "pointer-events-none opacity-0" : "opacity-100"}`}>
      {/* A soft glow behind the running bird. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <span className="h-[60vh] w-[60vh] max-w-[90vw] rounded-full bg-[#123C7E] opacity-40 blur-3xl" />
      </div>
      <div className="relative flex h-full flex-col items-center justify-center px-4">
        <div ref={runner} className="flex w-[100vw] max-w-5xl flex-col items-center will-change-transform" style={{ transform: "translateX(-65vw)" }}>
          <canvas ref={canvas} width={sprite.videoWidth} height={sprite.videoHeight} className="w-full max-h-[65vh] object-contain" role="img" aria-label={p(t.preloader.slogan)} />
        <div className="relative -mt-2 rounded-2xl border-2 border-navy bg-white px-6 py-3 shadow-[0_4px_0_rgb(12_43_92/0.15)] sm:-mt-6">
          <p className="font-display text-2xl font-black text-navy sm:text-4xl">{p(t.preloader.slogan)}</p>
          <span aria-hidden="true" className="absolute -top-[7px] start-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-s-2 border-t-2 border-navy bg-white" />
        </div>
        </div>
      </div>
      <button type="button" autoFocus onClick={() => finishRef.current()} className="btn-pill-white absolute end-4 top-4 px-5 py-2.5 font-display text-sm font-black uppercase tracking-wide sm:end-6 sm:top-6">
        {p(t.preloader.skip)}
      </button>
    </div>
  );
}
