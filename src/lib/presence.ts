// A technician's location from their phone: one GPS watcher shared by "Available" (positions
// for the team, so jobs nearby are priced from where they are) and a job's live location
// (positions for that job's customer). In the phone app it keeps going with the screen locked
// (background location plugin, with a notification saying so); on the website, while the page
// is open. Positions go straight to the API, outside React, so changing pages doesn't stop them.
import { useSyncExternalStore } from "react";
import { CapacitorHttp, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import superjson from "superjson";
import { apiUrl, isNativeApp } from "@/lib/native";
import { PING_SECONDS } from "@contracts/presence";

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

type Position = { lat: number; lng: number; accuracy?: number };
/** "denied": location permission refused; "unavailable": no fix (GPS off, no signal). */
export type LocationProblem = "denied" | "unavailable";
/** The notification shown while the app tracks in the background (phone app only). */
export type TrackingNotice = { title: string; message: string };

export type PresenceState = {
  /** Available: the team gets this technician's position. */
  online: boolean;
  /** The job whose customer sees the live location, if any. */
  sharedJob: number | null;
  /** Going online: waiting for permission and a first position. */
  starting: boolean;
  problem: LocationProblem | null;
};

/** A job's live location is sent at most this often. */
const JOB_EVERY_MS = 15_000;
/** How long to wait for a first position when going online or starting a job's location. */
const FIRST_FIX_MS = 20_000;

let state: PresenceState = { online: false, sharedJob: null, starting: false, problem: null };
const listeners = new Set<() => void>();
function update(patch: Partial<PresenceState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

/** The current state, outside React (after an await). */
export const getPresence = () => state;

export function usePresence() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/* ---------- sending ---------- */

/**
 * A tRPC mutation, sent directly. In the phone app it goes through native HTTP: Android slows
 * down a backgrounded web view's own requests after a few minutes.
 */
async function send(path: string, input?: unknown): Promise<"ok" | "refused" | "failed"> {
  try {
    const { getAccessToken } = await import("@/lib/supabase");
    const token = await getAccessToken();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const body = input === undefined ? {} : superjson.serialize(input);
    const url = apiUrl(`/api/trpc/${path}`);
    const status = isNativeApp
      ? (await CapacitorHttp.post({ url, headers, data: body })).status
      : (await fetch(url, { method: "POST", headers, body: JSON.stringify(body) })).status;
    // 4xx: the server said no (offline, job over, not a technician any more); 5xx: try again later.
    return status < 300 ? "ok" : status < 500 ? "refused" : "failed";
  } catch {
    return "failed";
  }
}

/* ---------- the watcher ---------- */

let watcher: { native: string } | { web: number } | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let last: Position | null = null;
let lastPing = 0;
let lastJob = 0;
let waiting: ((position: Position | null) => void) | null = null;
let lastProblem: LocationProblem | null = null;

function onPosition(position: Position) {
  last = position;
  lastProblem = null;
  if (waiting) {
    waiting(position);
    waiting = null;
  }
  void report(position);
}

async function report(position: Position) {
  const now = Date.now();
  if (state.online && now - lastPing >= PING_SECONDS * 1000) {
    lastPing = now;
    if ((await send("tech.ping", position)) === "refused") {
      update({ online: false });
      stopIfIdle();
    }
  }
  const job = state.sharedJob;
  if (job !== null && now - lastJob >= JOB_EVERY_MS) {
    lastJob = now;
    const result = await send("tech.reportLocation", { requestId: job, ...position });
    // The job isn't this technician's or isn't active any more.
    if (result === "refused" && state.sharedJob === job) stopJobLocation();
  }
}

function onProblem(problem: LocationProblem) {
  lastProblem = problem;
  if (waiting) {
    waiting(null);
    waiting = null;
    return;
  }
  // Permission taken away while running: nothing can be sent any more.
  if (problem === "denied") {
    if (state.online) void send("tech.goOffline");
    update({ online: false, sharedJob: null, problem });
    removeWatcher();
  }
}

async function ensureWatcher(notice: TrackingNotice) {
  if (watcher) return true;
  try {
    if (isNativeApp) {
      const id = await BackgroundGeolocation.addWatcher(
        {
          // With a message, the plugin keeps going in the background (a notification on Android).
          backgroundTitle: notice.title,
          backgroundMessage: notice.message,
          requestPermissions: true,
          stale: false,
          distanceFilter: 15,
        },
        (location, error) => {
          if (error) return onProblem(error.code === "NOT_AUTHORIZED" ? "denied" : "unavailable");
          if (location) onPosition({ lat: location.latitude, lng: location.longitude, accuracy: location.accuracy });
        },
      );
      watcher = { native: id };
    } else {
      if (!("geolocation" in navigator)) return false;
      const id = navigator.geolocation.watchPosition(
        (p) => onPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        (error) => onProblem(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable"),
        { enableHighAccuracy: true, maximumAge: 10_000 },
      );
      watcher = { web: id };
    }
  } catch {
    return false;
  }
  // Standing still sends nothing new: say "still here" now and then.
  heartbeat = setInterval(() => {
    if (last) void report(last);
  }, PING_SECONDS * 1000);
  return true;
}

function removeWatcher() {
  if (watcher && "native" in watcher) void BackgroundGeolocation.removeWatcher({ id: watcher.native });
  if (watcher && "web" in watcher) navigator.geolocation.clearWatch(watcher.web);
  if (heartbeat) clearInterval(heartbeat);
  watcher = null;
  heartbeat = null;
  last = null;
}

/** Nothing needs the location any more: stop the GPS (and the notification). */
function stopIfIdle() {
  if (!state.online && state.sharedJob === null) removeWatcher();
}

/** A first position: the latest one, or wait for the watcher's first. */
function firstFix(): Promise<Position | null> {
  if (last) return Promise.resolve(last);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiting = null;
      resolve(null);
    }, FIRST_FIX_MS);
    waiting = (position) => {
      clearTimeout(timer);
      resolve(position);
    };
  });
}

/* ---------- what the screens call ---------- */

/** Go Available: needs location permission and a position. */
export async function goOnline(notice: TrackingNotice): Promise<boolean> {
  update({ starting: true, problem: null });
  const started = await ensureWatcher(notice);
  const position = started ? await firstFix() : null;
  if (!position) {
    update({ starting: false, problem: lastProblem ?? "unavailable" });
    stopIfIdle();
    return false;
  }
  if ((await send("tech.goOnline", position)) !== "ok") {
    update({ starting: false, problem: "unavailable" });
    stopIfIdle();
    return false;
  }
  lastPing = Date.now();
  update({ online: true, starting: false });
  return true;
}

/** Go offline: the team stops getting the position (the server wipes it). */
export async function goOffline() {
  update({ online: false, problem: null });
  stopIfIdle();
  await send("tech.goOffline");
}

/** The app opened and the server says this technician is still Available: pick tracking back up. */
export async function resumeOnline(notice: TrackingNotice) {
  if (state.online || state.starting) return;
  update({ online: true });
  if (!(await ensureWatcher(notice))) {
    update({ online: false, problem: "unavailable" });
    void send("tech.goOffline");
  }
}

/** Show the customer of this job where the technician is (one job at a time). */
export async function startJobLocation(requestId: number, notice: TrackingNotice) {
  update({ sharedJob: requestId, problem: null });
  lastJob = 0;
  const started = await ensureWatcher(notice);
  const position = started ? await firstFix() : null;
  if (!position) {
    update({ sharedJob: null, problem: lastProblem ?? "unavailable" });
    stopIfIdle();
    return;
  }
  void report(position);
}

export function stopJobLocation() {
  update({ sharedJob: null });
  stopIfIdle();
}

/** Signing out: go offline and stop any job's live location. */
export async function stopAllLocation() {
  if (state.online) await goOffline();
  if (state.sharedJob !== null) stopJobLocation();
}

/** Phone app: open this app's settings, where location can be allowed again. */
export function openLocationSettings() {
  if (isNativeApp) void BackgroundGeolocation.openSettings();
}
