import app from "./app";
import { withAfterResponse } from "./lib/afterResponse";

/** What Netlify passes along with the request (only what this file uses). */
type NetlifyContext = { waitUntil?: (work: Promise<unknown>) => void };

const FUNCTION_PREFIX = "/.netlify/functions/api";

// Netlify Functions (v2) entry; bundled by scripts/build-netlify.mjs.
// netlify.toml rewrites /api/* here. Depending on how the request arrives, the URL
// may carry the internal function path, so map it back to /api/* before routing.
export default async function handler(req: Request, context?: NetlifyContext): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname.startsWith(FUNCTION_PREFIX)) {
    url.pathname = "/api" + url.pathname.slice(FUNCTION_PREFIX.length);
    req = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      duplex: "half", // required by Node when forwarding a streamed body
    } as RequestInit);
  }
  // Notifications finish after the answer: Netlify keeps the function alive for them. Without
  // waitUntil (an older runtime), they run before answering, as they always did.
  const waitUntil = context?.waitUntil?.bind(context);
  return waitUntil ? withAfterResponse(waitUntil, () => app.fetch(req)) : app.fetch(req);
}
