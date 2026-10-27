// Push notifications in the phone app (Android for now; iPhone once the Apple account is set
// up): asking at the right moment, giving the server this phone's Firebase address, and opening
// the right page when one is tapped. Off in the browser, and in app builds made without
// Firebase (VITE_PUSH_READY: android/app/google-services.json was there when it was built).
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { isNativeApp } from "@/lib/native";

export const pushAvailable =
  isNativeApp && Capacitor.getPlatform() === "android" && import.meta.env.VITE_PUSH_READY === "1";

/** on: getting them · off: turned off in My account · ask: never answered · blocked: refused in the phone's settings. */
export type PushStatus = "on" | "off" | "ask" | "blocked" | "unavailable";

const OFF_KEY = "br-push-off";
const LATER_KEY = "br-push-later";
/** This phone's address, to forget it on the server when signing out. */
const TOKEN_KEY = "br-push-token";

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // private storage off: it only means asking again
  }
};

export async function pushStatus(): Promise<PushStatus> {
  if (!pushAvailable) return "unavailable";
  if (read(OFF_KEY)) return "off";
  const { receive } = await PushNotifications.checkPermissions();
  return receive === "granted" ? "on" : receive === "denied" ? "blocked" : "ask";
}

/** "Not now" on the invitation: don't show it again (My account can still turn them on). */
export const pushLater = () => write(LATER_KEY, "1");
export const pushAskedLater = () => !!read(LATER_KEY);

/** Android shows these as separate switches: emergencies are louder and wake the phone. */
async function createChannels() {
  await PushNotifications.createChannel({ id: "updates", name: "Updates", importance: 3, visibility: 1 });
  await PushNotifications.createChannel({
    id: "urgent",
    name: "Emergencies and new jobs",
    importance: 5,
    visibility: 1,
    vibration: true,
  });
}

/** Asks Firebase for this phone's address. */
async function fetchToken(): Promise<string> {
  const listeners: { remove: () => Promise<void> }[] = [];
  const done = () => listeners.forEach((l) => void l.remove());
  try {
    return await new Promise<string>((resolve, reject) => {
      void (async () => {
        listeners.push(await PushNotifications.addListener("registration", (t) => resolve(t.value)));
        listeners.push(await PushNotifications.addListener("registrationError", (e) => reject(new Error(e.error))));
        await PushNotifications.register();
      })().catch(reject);
    });
  } finally {
    done();
  }
}

/**
 * Notifications on: ask the phone (once; after a refusal only its settings can allow them),
 * then hand the address to `save` (the server). Also used silently when already allowed.
 */
export async function turnOnPush(save: (token: string) => Promise<unknown>): Promise<PushStatus> {
  if (!pushAvailable) return "unavailable";
  write(OFF_KEY, null);
  let { receive } = await PushNotifications.checkPermissions();
  if (receive !== "granted") receive = (await PushNotifications.requestPermissions()).receive;
  if (receive !== "granted") return receive === "denied" ? "blocked" : "ask";
  await createChannels();
  const token = await fetchToken();
  write(TOKEN_KEY, token);
  await save(token);
  return "on";
}

/** Signing out: the server forgets this phone, so the next person signed in here doesn't get the previous one's. */
export async function forgetPushDevice(forget: (token: string) => Promise<unknown>) {
  const token = read(TOKEN_KEY);
  if (!token) return;
  write(TOKEN_KEY, null);
  await forget(token).catch(() => {});
}

/** Turned off in My account: forgotten on the server, and this phone's address dropped. */
export async function turnOffPush(forget: (token: string) => Promise<unknown>) {
  write(OFF_KEY, "1");
  await forgetPushDevice(forget);
  if (pushAvailable) await PushNotifications.unregister().catch(() => {});
}

/**
 * A notification tapped (app closed or in the background): open its page. One arriving while
 * the app is open: refresh what's on screen (Android also shows it, see capacitor.config.ts).
 */
export async function listenToPush(handlers: { open: (path: string) => void; arrived: () => void }) {
  if (!pushAvailable) return () => {};
  const tapped = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const path = action.notification.data?.path;
    if (typeof path === "string" && path.startsWith("/")) handlers.open(path);
  });
  const received = await PushNotifications.addListener("pushNotificationReceived", () => handlers.arrived());
  return () => {
    void tapped.remove();
    void received.remove();
  };
}
