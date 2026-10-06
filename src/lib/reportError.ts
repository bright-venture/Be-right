import { apiUrl, isNativeApp } from "./native";
// Sends front-end crashes to our own API (server/app.ts → "[client-error]" in the logs).
// Only the error, the page path and the build are sent: never query strings or hashes,
// which can carry sign-in tokens.

const MAX_REPORTS_PER_PAGE = 5;
let sent = 0;

/** Noise from browsers and extensions, not from our code. */
const IGNORED = /ResizeObserver loop|chrome-extension:|moz-extension:|safari-web-extension:/;

export function reportError(error: unknown, source: string) {
  const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : JSON.stringify(error));
  if (IGNORED.test(`${e.message} ${e.stack ?? ""}`)) return;
  if (import.meta.env.DEV) {
    console.error(`[reportError] ${source}`, e);
    return;
  }
  if (sent >= MAX_REPORTS_PER_PAGE) return;
  sent++;
  const body = JSON.stringify({
    message: `${source}: ${e.message}`,
    stack: e.stack,
    page: window.location.pathname,
    release: import.meta.env.VITE_RELEASE,
  });
  try {
    // The app reports to the live site, where a beacon can't carry JSON: it uses fetch.
    const queued = !isNativeApp && navigator.sendBeacon?.("/api/client-error", new Blob([body], { type: "application/json" }));
    if (!queued) {
      void fetch(apiUrl("/api/client-error"), { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } });
    }
  } catch {
    // Reporting must never cause another error.
  }
}

/** Errors nothing else caught. React render errors go through ErrorBoundary. */
export function installErrorReporting() {
  window.addEventListener("error", (event) => reportError(event.error ?? event.message, "error"));
  window.addEventListener("unhandledrejection", (event) => reportError(event.reason, "unhandledrejection"));
}

/**
 * After a deploy, a tab opened earlier asks for page files that no longer exist.
 * Reload once to get the new version instead of showing an error.
 */
export function isStaleBuildError(error: unknown) {
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(
    error instanceof Error ? error.message : String(error),
  );
}

export function reloadForNewBuild() {
  const KEY = "br-reloaded-for-build";
  try {
    // Once a minute at most, so a real outage doesn't turn into a reload loop.
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
