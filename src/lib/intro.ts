/** The bird intro (src/components/Preloader.tsx): when it plays, and how to replay it. */

/** Footer "Replay intro" fires this; src/main.tsx shows the intro again. */
export const INTRO_REPLAY_EVENT = "br:replay-intro";
/** The intro ended or was skipped: the home page starts its entrance (src/pages/Home.tsx). */
export const INTRO_DONE_EVENT = "br:launch-cut";

const SEEN_KEY = "br-video-intro-v2";

/** Once per browser session, on the home page only, and never for reduced motion. */
export function shouldPlayIntro() {
  if (window.location.pathname !== "/") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    return sessionStorage.getItem(SEEN_KEY) !== "1";
  } catch {
    return true;
  }
}

export function markIntroSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Storage blocked: the intro may play again next time, which is harmless.
  }
}
