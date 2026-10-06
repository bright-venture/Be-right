import { getSupabaseAdmin } from "./supabase";
import { findOrCreateUser } from "../queries/users";

function bearerToken(headers: Headers): string | null {
  const header = headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * Verifies the Supabase access token sent by the browser and returns the
 * matching app user (created on first sign-in). Returns undefined when the
 * request is anonymous or the token is invalid.
 */
export async function authenticateRequest(headers: Headers) {
  const token = bearerToken(headers);
  if (!token) return undefined;

  const { data, error } = await getSupabaseAdmin().auth.getClaims(token);
  if (error) {
    // A forged, malformed or expired token just means "not signed in". Anything else
    // (Supabase unreachable, a wrong SUPABASE_URL) is a server problem: throwing makes
    // the sign-in page say so, instead of silently looking signed out.
    if (error.name === "AuthInvalidJwtError") return undefined;
    throw error;
  }
  if (!data?.claims?.sub) return undefined;

  const claims = data.claims;
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 255) : null);
  const name = text(meta.full_name) ?? text(meta.name);
  const phone = text(meta.phone)?.slice(0, 64) ?? null;
  // Recorded by the sign-up form when the "I agree" box is ticked.
  const termsVersion = text(meta.terms_version)?.slice(0, 32) ?? null;

  return (
    (await findOrCreateUser({
    authId: claims.sub,
    email: typeof claims.email === "string" && claims.email ? claims.email : null,
    name,
    phone,
    termsVersion,
    })) ?? undefined
  );
}
