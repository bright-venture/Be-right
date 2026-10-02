/**
 * Whether this browser might be signed in, answered without loading the Supabase
 * library (≈60 KB): visitors who never signed in don't need it on most pages.
 * Supabase keeps the session in localStorage under "sb-<project>-auth-token", and
 * email links (confirm, reset, invite) arrive with tokens in the URL.
 */
export function mightBeSignedIn() {
  return hasStoredSession() || hasAuthInUrl();
}

function hasStoredSession() {
  try {
    return Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
  } catch {
    return true; // storage blocked: let Supabase decide
  }
}

function hasAuthInUrl() {
  const { hash, search } = window.location;
  return /access_token=|error_description=/.test(hash) || /[?&]code=/.test(search);
}

/** Set just before leaving a deleted account; the home page shows a one-time notice. */
export const ACCOUNT_DELETED_FLAG = "br-account-deleted";

/** Fired by src/lib/supabase.ts whenever the signed-in identity changes. */
export const AUTH_CHANGED_EVENT = "br-auth-changed";
