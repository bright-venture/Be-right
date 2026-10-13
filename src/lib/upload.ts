import { isSafeStorageKey } from "@contracts/uploads";
import { supabase } from "@/lib/supabase";

/**
 * Sends a file to the upload link the server made. The path is checked first, so a file can
 * only ever go to a plain folder path (never one with "..").
 */
export async function uploadToSignedTarget(
  target: { bucket: string; key: string; token: string },
  file: Blob,
  contentType: string,
) {
  if (!isSafeStorageKey(target.key) || target.key.includes("../") || target.key.includes("..\\")) {
    throw new Error("Unexpected upload path");
  }
  const { error } = await supabase.storage
    .from(target.bucket)
    .uploadToSignedUrl(target.key, target.token, file, { contentType });
  if (error) throw error;
}
