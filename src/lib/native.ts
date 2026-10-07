/**
 * The phone app (Capacitor) runs this same site from files on the phone, at
 * https://localhost (Android) or capacitor://localhost (iOS). Anything that needs the
 * real website — the API, links in emails — goes through here.
 */
import { Capacitor } from "@capacitor/core";

export const isNativeApp = Capacitor.isNativePlatform();

/**
 * The app's own screens (tab bar, app home, services list) instead of the website's.
 * Always on in the phone app. In development, open any page with `?app` to preview
 * them in the browser (`?app=0` switches back).
 */
export const isAppUi = isNativeApp || (import.meta.env.DEV && appPreview());

function appPreview() {
  try {
    const flag = new URLSearchParams(window.location.search).get("app");
    if (flag !== null) sessionStorage.setItem("br-app-ui", flag === "0" ? "0" : "1");
    return sessionStorage.getItem("br-app-ui") === "1";
  } catch {
    return false;
  }
}

/** The live website. The app talks to its API and sends email links to it. */
export const SITE_ORIGIN = "https://be-rightbright.com";

/** Where the site's own pages live: this tab on the web, the live website from the app. */
export const siteOrigin = () => (isNativeApp ? SITE_ORIGIN : window.location.origin);

/** API address: same site on the web, the live website from the app. */
export const apiUrl = (path: string) => (isNativeApp ? SITE_ORIGIN : "") + path;

/** App-only setup: Android back button, and the page kept clear of the status bar. */
export async function startNativeApp() {
  if (!isNativeApp) return;
  document.documentElement.classList.add("native-app");
  // The website draws under the notch (viewport-fit=cover); in the app the page starts
  // below the system bars instead, so nothing hides under the clock or the camera.
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute("content", "width=device-width, initial-scale=1.0, viewport-fit=auto");
  const { App } = await import("@capacitor/app");
  await App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.exitApp();
  });
}
