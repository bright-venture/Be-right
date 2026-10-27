// Push notifications to the Be Right app, through Firebase Cloud Messaging (HTTP v1 API).
// Off until FIREBASE_SERVICE_ACCOUNT is set. Like emails, a failed push is logged and never
// fails the change that caused it. Phones Firebase no longer knows are forgotten.
import { createSign } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { pushDevices } from "../../db/schema";
import { getDb } from "../queries/connection";
import { env } from "./env";

type Lang = "en" | "ar";

export type PushMessage = {
  title: Record<Lang, string>;
  body: Record<Lang, string>;
  /** The app page a tap opens, e.g. "/tech?job=12". */
  path: string;
  /** Emergencies: a separate, louder channel that wakes the phone. */
  urgent?: boolean;
};

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

let warnedOff = false;
function account(): ServiceAccount | null {
  if (!env.firebaseServiceAccount) {
    if (!warnedOff) console.warn("[push] FIREBASE_SERVICE_ACCOUNT not set: push notifications are off");
    warnedOff = true;
    return null;
  }
  try {
    const parsed = JSON.parse(env.firebaseServiceAccount) as ServiceAccount;
    return parsed.project_id && parsed.client_email && parsed.private_key ? parsed : null;
  } catch {
    console.error("[push] FIREBASE_SERVICE_ACCOUNT is not valid JSON");
    return null;
  }
}

const base64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

/** Google's access token for sending, kept until shortly before it expires (an hour). */
let cached: { token: string; until: number } | null = null;
async function accessToken(sa: ServiceAccount) {
  if (cached && cached.until > Date.now()) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify(claims))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64url(signature)}`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google sign-in for push failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, until: Date.now() + (data.expires_in - 120) * 1000 };
  return data.access_token;
}

/** Firebase's answer meaning this phone won't get anything any more (app removed, token reset). */
function isGone(status: number, body: string) {
  return status === 404 || /UNREGISTERED|registration-token-not-registered/.test(body) || (status === 400 && /token/i.test(body));
}

/**
 * Sends one notification to every phone of these people, each in its own app language.
 * Returns how many phones Firebase accepted it for (0 when push is off or nobody has the app).
 */
export async function sendPush(userIds: (number | null | undefined)[], message: PushMessage): Promise<number> {
  const ids = [...new Set(userIds.filter((id): id is number => typeof id === "number"))];
  if (!ids.length) return 0;
  const sa = account();
  if (!sa) return 0;
  const db = getDb();
  const devices = await db.select().from(pushDevices).where(inArray(pushDevices.userId, ids));
  if (!devices.length) return 0;
  const token = await accessToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`;
  let delivered = 0;
  await Promise.all(
    devices.map(async (device) => {
      const lang: Lang = device.lang === "ar" ? "ar" : "en";
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            message: {
              token: device.token,
              notification: { title: message.title[lang], body: message.body[lang] },
              data: { path: message.path },
              android: {
                priority: message.urgent ? "high" : "normal",
                notification: { channel_id: message.urgent ? "urgent" : "updates", sound: "default" },
              },
            },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          delivered++;
          return;
        }
        const body = await res.text();
        if (isGone(res.status, body)) {
          await db.delete(pushDevices).where(eq(pushDevices.id, device.id));
          return;
        }
        console.error(`[push] Firebase refused (${res.status})`, body.slice(0, 300));
      } catch (error) {
        console.error("[push] sending failed", error);
      }
    }),
  );
  return delivered;
}
