import { getSupabaseAdmin } from "./supabase";
import { findOrCreateUser } from "../queries/users";

function bearerToken(headers: Headers): string | null {
  const header = headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
}

/** How the session was started, from the token's `amr` claim: "password", "otp", "oauth", "recovery"... */
function signInMethods(amr: unknown): string[] {
  if (!Array.isArray(amr)) return [];
  return amr
    .map((entry) => (typeof entry === "string" ? entry : (entry as { method?: unknown })?.method))
    .filter((m): m is string => typeof m === "string");
}

/**
 * Verifies the Supabase access token sent by the browser and returns the
 * matching app user (created on first sign-in). Returns undefined when the
 * request is anonymous or the token is invalid.
 */
export async function authenticateRequest(headers: Headers) {
  return (await authenticateSession(headers))?.user;
}

/** Like authenticateRequest, plus how this session was started. */
export async function authenticateSession(headers: Headers) {
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

  const user = await findOrCreateUser({
    authId: claims.sub,
    email: typeof claims.email === "string" && claims.email ? claims.email : null,
    name,
    phone,
    termsVersion,
  });
  return user
    ? {
        user,
        signInMethods: signInMethods(claims.amr),
        // "aal2" once the session passed a second step (authenticator app code).
        assuranceLevel: typeof claims.aal === "string" ? claims.aal : "aal1",
      }
    : undefined;
}
