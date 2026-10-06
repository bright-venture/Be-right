/**
 * Cloudflare Web Analytics: page views and load speed, no cookies, nothing personal.
 * Off until VITE_CF_ANALYTICS_TOKEN is set (Cloudflare → Analytics & Logs → Web Analytics).
 * Loaded when the browser is idle so it never slows the first paint.
 */
export function startAnalytics() {
  // The setting should hold just the 32-character token, but Cloudflare's whole snippet
  // is easy to paste by mistake: take the token out of it (a wrong one makes every
  // report fail with a CORS error).
  const token = import.meta.env.VITE_CF_ANALYTICS_TOKEN?.match(/[0-9a-f]{32}/i)?.[0];
  if (!token || !import.meta.env.PROD) return;
  const load = () => {
    const script = document.createElement("script");
    script.defer = true;
    script.src = "https://static.cloudflareinsights.com/beacon.min.js";
    script.dataset.cfBeacon = JSON.stringify({ token, spa: true });
    document.head.appendChild(script);
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 5000 });
  else setTimeout(load, 3000);
}
