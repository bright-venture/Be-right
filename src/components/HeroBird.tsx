import { useEffect, useRef } from "react";
import { refineBirdMatte } from "@/lib/birdMatte";

/** The standing pose from the approved 3D animation; no second entrance run. */
export function HeroBird({ className, onSettled }: { className?: string; onSettled?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const callback = useRef(onSettled);
  useEffect(() => {
    callback.current = onSettled;
  });
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const output = canvas.current;
      const context = output?.getContext("2d", { willReadFrequently: true });
      if (output && context) {
        context.drawImage(image, 310, 0, 560, 720, 0, 0, output.width, output.height);
        const frame = context.getImageData(0, 0, output.width, output.height);
        context.putImageData(refineBirdMatte(frame), 0, 0);
      }
      callback.current?.();
    };
    image.onerror = () => callback.current?.();
    image.src = "/assets/bird-intro-poster.jpg";
    return () => { cancelled = true; };
  }, []);
  return <div data-hero-bird className={`relative select-none ${className ?? ""}`} style={{ aspectRatio: "7 / 9" }}>
    <canvas ref={canvas} width={600} height={771} role="img" aria-label="Be Right 3D bird mascot giving a thumbs up" className="h-full w-full" />
  </div>;
}
