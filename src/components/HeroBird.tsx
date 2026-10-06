import { useEffect, useRef } from "react";
import { refineBirdMatte } from "@/lib/birdMatte";
import { removeStudioBackground } from "@/lib/matte";

const WIDTH = 600;
const HEIGHT = 771;

let cutOut: Promise<ImageData | null> | undefined;

/**
 * The bird cut out of the intro's poster frame. Removing the studio background is
 * pixel-by-pixel work, so it runs once per visit and every HeroBird (the page shows a
 * phone and a desktop one) reuses the result, also when coming back to the home page.
 */
function birdCutOut() {
  cutOut ??= new Promise<ImageData | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return resolve(null);
      context.drawImage(image, 310, 0, 560, 720, 0, 0, WIDTH, HEIGHT);
      // On the background thread; if that fails, on this one.
      void removeStudioBackground(context.getImageData(0, 0, WIDTH, HEIGHT)).then(
        (clean) => resolve(clean ?? refineBirdMatte(context.getImageData(0, 0, WIDTH, HEIGHT))),
      );
    };
    image.onerror = () => resolve(null);
    image.src = "/assets/bird-intro-poster.jpg";
  }).then((result) => {
    if (!result) cutOut = undefined; // try again next time
    return result;
  });
  return cutOut;
}

/** The standing pose from the approved 3D animation; no second entrance run. */
export function HeroBird({ className, onSettled }: { className?: string; onSettled?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const callback = useRef(onSettled);
  useEffect(() => {
    callback.current = onSettled;
  });
  useEffect(() => {
    let cancelled = false;
    void birdCutOut().then((pixels) => {
      if (cancelled) return;
      if (pixels) canvas.current?.getContext("2d")?.putImageData(pixels, 0, 0);
      callback.current?.();
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div data-hero-bird className={`relative select-none ${className ?? ""}`} style={{ aspectRatio: "7 / 9" }}>
      <canvas
        ref={canvas}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label="Be Right 3D bird mascot giving a thumbs up"
        className="h-full w-full"
      />
    </div>
  );
}
