import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { MAX_DOCUMENT_BYTES, type ApplicationDocument } from "@contracts/applications";
import { isSafeStorageKey, PHOTO_TYPES } from "@contracts/uploads";
import { env } from "./env";
import { getSupabaseAdmin } from "./supabase";
import { getDb } from "../queries/connection";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB per customer photo/video
const SIGNED_URL_TTL_SECONDS = 60 * 30;
/** Identity documents get shorter-lived links than job photos. */
const DOCUMENT_URL_TTL_SECONDS = 60 * 5;

/**
 * Private buckets, created on first use. The bucket itself refuses other file types, whatever
 * the browser claimed when asking for the upload link (photos are a list: no SVG).
 */
const BUCKETS = {
  media: { name: () => env.storageBucket, fileSizeLimit: MAX_UPLOAD_BYTES, mime: [...PHOTO_TYPES, "video/*"] },
  docs: { name: () => env.docsBucket, fileSizeLimit: MAX_DOCUMENT_BYTES, mime: [...PHOTO_TYPES, "application/pdf"] },
} as const;
export type BucketId = keyof typeof BUCKETS;

const bucketReady: Partial<Record<BucketId, Promise<void>>> = {};

function ensureBucket(id: BucketId) {
  if (!bucketReady[id]) {
    const spec = BUCKETS[id];
    bucketReady[id] = (async () => {
      const storage = getSupabaseAdmin().storage;
      const { data } = await storage.getBucket(spec.name());
      if (data) {
        // Buckets made before the file types changed get the current list.
        const current = [...(data.allowed_mime_types ?? [])].sort().join(",");
        if (current !== [...spec.mime].sort().join(",")) {
          const { error } = await storage.updateBucket(spec.name(), {
            public: false,
            fileSizeLimit: spec.fileSizeLimit,
            allowedMimeTypes: [...spec.mime],
          });
          if (error) throw error;
        }
        return;
      }
      const { error } = await storage.createBucket(spec.name(), {
        public: false,
        fileSizeLimit: spec.fileSizeLimit,
        allowedMimeTypes: [...spec.mime],
      });
      if (error && !/already exists/i.test(error.message)) throw error;
    })().catch((error) => {
      delete bucketReady[id];
      throw error;
    });
  }
  return bucketReady[id];
}

function safeFileName(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(-80);
  return cleaned || "file";
}

/** Refuses any path that isn't a plain folder path the app made (see isSafeStorageKey). */
function assertSafeKeys(keys: string[]) {
  if (keys.some((key) => !isSafeStorageKey(key))) throw new Error("Invalid storage path");
}

async function signedUploadUrl(id: BucketId, key: string) {
  assertSafeKeys([key]);
  await ensureBucket(id);
  const { data, error } = await getSupabaseAdmin()
    .storage.from(BUCKETS[id].name())
    .createSignedUploadUrl(key);
  if (error || !data) throw error ?? new Error("Could not create upload URL");
  return { key, token: data.token, bucket: BUCKETS[id].name() };
}

async function signedUrls(id: BucketId, keys: string[], ttl: number) {
  // An odd path just gets no link, so one bad row can't break a whole list.
  keys = keys.filter(isSafeStorageKey);
  if (!keys.length) return {} as Record<string, string>;
  const { data, error } = await getSupabaseAdmin()
    .storage.from(BUCKETS[id].name())
    .createSignedUrls(keys, ttl);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  }
  return map;
}

/* ---------- customer request photos/videos ---------- */

export const MEDIA_PREFIX = "requests/";

/** Every customer upload lives under this prefix; used to verify ownership later. */
export function userUploadPrefix(authId: string) {
  return `${MEDIA_PREFIX}${authId}/`;
}

/**
 * True only for a file directly in this person's own upload folder. A key that merely
 * starts with their folder, such as "requests/<them>/../<someone else>/photo.jpg", is refused.
 */
export function isOwnUploadKey(authId: string, key: string) {
  const prefix = userUploadPrefix(authId);
  return isSafeStorageKey(key) && key.startsWith(prefix) && !key.slice(prefix.length).includes("/");
}

export function createUploadUrl(authId: string, fileName: string) {
  return signedUploadUrl("media", `${userUploadPrefix(authId)}${randomUUID()}-${safeFileName(fileName)}`);
}

export function createSignedUrls(keys: string[]) {
  return signedUrls("media", keys, SIGNED_URL_TTL_SECONDS);
}

/** True only if every photo was actually uploaded. */
export async function mediaExists(keys: string[]) {
  assertSafeKeys(keys);
  const bucket = getSupabaseAdmin().storage.from(env.storageBucket);
  const results = await Promise.all(keys.map((k) => bucket.exists(k)));
  return results.every((r) => r.data === true);
}

/* ---------- technician application documents ---------- */

/** Application uploads happen before any account exists, so keys are random and kind-tagged. */
export const DOCUMENT_PREFIX = "applications/";

export function documentKeyMatches(key: string, kind: ApplicationDocument) {
  return isSafeStorageKey(key) && new RegExp(`^${DOCUMENT_PREFIX}[0-9a-f-]{36}/${kind}-[\\w.-]+$`).test(key);
}

export function createDocumentUploadUrl(kind: ApplicationDocument, fileName: string) {
  return signedUploadUrl("docs", `${DOCUMENT_PREFIX}${randomUUID()}/${kind}-${safeFileName(fileName)}`);
}

/** True only if every key was actually uploaded. */
export async function documentsExist(keys: string[]) {
  assertSafeKeys(keys);
  const bucket = getSupabaseAdmin().storage.from(env.docsBucket);
  const results = await Promise.all(keys.map((k) => bucket.exists(k)));
  return results.every((r) => r.data === true);
}

export function createDocumentUrls(keys: string[]) {
  return signedUrls("docs", keys, DOCUMENT_URL_TTL_SECONDS);
}

/** Signed link to a technician's profile photo (users.avatar holds its document key). */
export async function profilePhotoUrl(avatarKey: string | null | undefined) {
  if (!avatarKey?.startsWith(DOCUMENT_PREFIX)) return null;
  const urls = await signedUrls("docs", [avatarKey], SIGNED_URL_TTL_SECONDS);
  return urls[avatarKey] ?? null;
}

/** Several people's profile photos in one storage call (for lists), by avatar key. */
export async function profilePhotoUrls(avatarKeys: (string | null | undefined)[]) {
  const keys = [...new Set(avatarKeys.filter((k): k is string => !!k?.startsWith(DOCUMENT_PREFIX)))];
  return keys.length ? signedUrls("docs", keys, SIGNED_URL_TTL_SECONDS) : ({} as Record<string, string>);
}

/* ---------- clean-up ---------- */

/**
 * Files under `prefix` uploaded before `before`, oldest first. Read from Supabase's
 * storage catalogue in one query (the Storage API can only list one folder at a time).
 */
export async function listFilesCreatedBefore(id: BucketId, prefix: string, before: Date, limit = 1000) {
  const rows = await getDb().execute<{ name: string }>(sql`
    select name from storage.objects
    where bucket_id = ${BUCKETS[id].name()}
      and starts_with(name, ${prefix})
      and created_at < ${before.toISOString()}::timestamptz
    order by created_at
    limit ${limit}`);
  return [...rows].map((r) => r.name);
}

/** Permanently delete files (batched; Supabase removes up to 1,000 paths per call). */
export async function deleteFiles(id: BucketId, keys: string[]) {
  assertSafeKeys(keys);
  const bucket = getSupabaseAdmin().storage.from(BUCKETS[id].name());
  for (let i = 0; i < keys.length; i += 500) {
    const { error } = await bucket.remove(keys.slice(i, i + 500));
    if (error) throw error;
  }
}

export function deleteDocuments(keys: string[]) {
  return deleteFiles("docs", keys);
}
