// Makes public/assets/bird-run-{sm,lg}.webp (phones, computers) and src/lib/birdRun.json:
// the intro's running frames, already cut out of their white studio background, packed in
// one transparent picture per size. The intro then only flips through frames, so the legs
// run smoothly on every phone (cutting out each frame while it played was too slow on some
// phones, and some phones block video altogether).
//
// usage: start the dev server (npm run dev), then: node scripts/make-bird-run.mjs [--probe]
// Needs Google Chrome. --probe only prints where the bird is in each frame.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SITE = "http://localhost:3000/";
const probe = process.argv.includes("--probe");
// The run, in video seconds (the clip stands still before it), sampled every `step` seconds.
const RUN = { from: 2.5, to: 9.0, step: 0.1 };
// Video frame sizes: phones get a lighter picture (it is decoded whole into memory).
const SIZES = { sm: { width: 512, height: 288 }, lg: { width: 768, height: 432 } };

const profile = mkdtempSync(path.join(tmpdir(), "bird-run-"));
const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, "--no-first-run", `--user-data-dir=${profile}`, "about:blank"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 150 && !targets; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); }
}
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const waiting = new Map();
ws.onmessage = ({ data }) => { const m = JSON.parse(data); waiting.get(m.id)?.(m); waiting.delete(m.id); };
const send = (method, params = {}) => new Promise((r) => { const n = ++id; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });

/** Runs in the page: grabs, cleans and packs the frames for one size. */
const makeSheet = (S, probeOnly) => `(async () => {
  const S = ${JSON.stringify(S)};
  const { refineBirdMatte } = await import("/src/lib/birdMatte.ts");
  const video = document.createElement("video");
  video.muted = true; video.preload = "auto"; video.src = "/assets/bird-intro.mp4";
  await new Promise((ok, fail) => { video.onloadeddata = ok; video.onerror = fail; });
  const grab = new OffscreenCanvas(S.width, S.height).getContext("2d", { willReadFrequently: true });
  const frames = [];
  const count = Math.round((S.to - S.from) / S.step) + 1;
  for (let i = 0; i < count; i++) {
    video.currentTime = S.from + i * S.step;
    await new Promise((ok) => (video.onseeked = ok));
    grab.clearRect(0, 0, S.width, S.height);
    grab.drawImage(video, 0, 0, S.width, S.height);
    const image = refineBirdMatte(grab.getImageData(0, 0, S.width, S.height));
    let x0 = S.width, y0 = S.height, x1 = -1, y1 = -1;
    for (let y = 0; y < S.height; y++) for (let x = 0; x < S.width; x++) {
      if (image.data[(y * S.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    frames.push({ t: +(S.from + i * S.step).toFixed(2), image, box: [x0, y0, x1, y1] });
  }
  if (${probeOnly}) return { boxes: frames.map((f) => f.t + ": " + f.box.join(",")) };
  // One crop for every frame (the union of where the bird is), so the frames line up.
  const box = frames.reduce((b, f) => f.box[2] < 0 ? b : [Math.min(b[0], f.box[0]), Math.min(b[1], f.box[1]), Math.max(b[2], f.box[2]), Math.max(b[3], f.box[3])], [S.width, S.height, 0, 0]);
  const pad = 2;
  const cx = Math.max(0, box[0] - pad), cy = Math.max(0, box[1] - pad);
  const cw = Math.min(S.width, box[2] + pad + 1) - cx, ch = Math.min(S.height, box[3] + pad + 1) - cy;
  const columns = Math.ceil(Math.sqrt(frames.length * ch / cw));
  const rows = Math.ceil(frames.length / columns);
  const sheet = new OffscreenCanvas(columns * cw, rows * ch);
  const pen = sheet.getContext("2d");
  const one = new OffscreenCanvas(S.width, S.height).getContext("2d");
  frames.forEach((f, i) => {
    one.putImageData(f.image, 0, 0);
    pen.drawImage(one.canvas, cx, cy, cw, ch, (i % columns) * cw, Math.floor(i / columns) * ch, cw, ch);
  });
  const blob = await sheet.convertToBlob({ type: "image/webp", quality: 0.82 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = ""; for (const b of bytes) binary += String.fromCharCode(b);
  return {
    webp: btoa(binary),
    meta: { frames: frames.length, columns, frameWidth: cw, frameHeight: ch, videoWidth: S.width, videoHeight: S.height, crop: [cx, cy] },
  };
})()`;

await send("Page.navigate", { url: SITE + "privacy" });
await sleep(1500);
const out = { from: RUN.from, step: RUN.step };
for (const [name, size] of Object.entries(SIZES)) {
  const { result } = await send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: makeSheet({ ...RUN, ...size }, probe) });
  const value = result.result?.value;
  if (!value) { console.error(result.exceptionDetails ?? result); process.exit(1); }
  if (value.boxes) { console.log(value.boxes.join("\n")); break; }
  writeFileSync(`public/assets/bird-run-${name}.webp`, Buffer.from(value.webp, "base64"));
  console.log(name, Math.round((value.webp.length * 0.75) / 1024), "KB", JSON.stringify(value.meta));
  out[name] = value.meta;
}
if (!probe) writeFileSync("src/lib/birdRun.json", JSON.stringify(out, null, 2) + "\n");
chrome.kill();
await sleep(300);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold it */ }
process.exit(0);
