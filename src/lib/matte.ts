import { refineBirdMatte } from "./birdMatte";

/**
 * Removes the white studio background from a bird frame on a background thread.
 * The intro does this for every video frame: on the main thread it kept the page busy
 * for seconds (Lighthouse "total blocking time"). Without Worker support it falls back
 * to the main thread. Resolves to null if the worker failed (skip that frame).
 */
export function removeStudioBackground(image: ImageData): Promise<ImageData | null> {
  const w = worker();
  if (!w) return Promise.resolve(refineBirdMatte(image));
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    // The pixels are handed over, not copied: the caller can't use `image` afterwards.
    w.postMessage({ id, image }, [image.data.buffer]);
  });
}

type Job = { id: number; image: ImageData };
let instance: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, (image: ImageData | null) => void>();

function worker() {
  if (instance !== undefined) return instance;
  try {
    instance = new Worker(new URL("./birdMatte.worker.ts", import.meta.url), { type: "module" });
    instance.onmessage = ({ data }: MessageEvent<Job>) => {
      pending.get(data.id)?.(data.image);
      pending.delete(data.id);
    };
    instance.onerror = () => {
      // e.g. blocked by a security policy: finish what's waiting, then use the main thread.
      instance?.terminate();
      instance = null;
      for (const resolve of pending.values()) resolve(null);
      pending.clear();
    };
  } catch {
    instance = null;
  }
  return instance;
}
