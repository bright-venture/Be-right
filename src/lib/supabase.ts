import { createClient } from "@supabase/supabase-js";
import { AUTH_CHANGED_EVENT } from "./session";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  console.error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY: sign-in and uploads will not work.",
  );
}

export const supabase = createClient(url ?? "http://localhost", publishableKey ?? "missing", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Whichever page loads this module first (sign-in form, uploads, a stored session),
// tell the app when the identity changes so it refetches the account and its data.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }
});

export async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
