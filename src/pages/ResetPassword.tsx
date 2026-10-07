import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { safeNext } from "@/lib/navigation";

const MIN_PASSWORD = 8;

/**
 * Landing page of the "reset password" email. Supabase signs the user in with a
 * short-lived recovery session from the link; here they choose a new password.
 */
export default function ResetPassword() {
  const { t, p } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeNext(params.get("next"));
  // Invited technicians arrive here too (?welcome=1): same form, friendlier wording.
  const welcome = params.get("welcome") === "1";
  const [ready, setReady] = useState<"waiting" | "ok" | "expired">("waiting");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) setReady("ok");
    });
    // The link may already have been processed before this listener attached.
    void supabase.auth.getSession().then(({ data: s }) => {
      if (s.session) setReady("ok");
    });
    const timer = window.setTimeout(() => setReady((r) => (r === "waiting" ? "expired" : r)), 5000);
    return () => {
      data.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(p(t.auth.errWeak));
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      return setError(error.code === "weak_password" ? p(t.auth.errWeak) : error.message);
    }
    // Sign in again with the new password, so this session counts as a password sign-in
    // (the admin area requires one; a reset link alone isn't enough).
    if (data.user?.email) await supabase.auth.signInWithPassword({ email: data.user.email, password });
    setBusy(false);
    setDone(true);
    window.setTimeout(() => navigate(next, { replace: true }), 1500);
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-4 py-24">
        <div className="card-br w-full max-w-md p-6 sm:p-8">
          <h1 className="font-display text-2xl font-black text-navy">
            {welcome ? p(t.auth.welcomeTitle) : p(t.auth.setNewTitle)}
          </h1>
          {welcome && ready !== "expired" && (
            <p className="mt-2 text-sm leading-relaxed text-navy/70">{p(t.auth.welcomeSub)}</p>
          )}

          {ready === "waiting" && <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-navy" />}

          {ready === "expired" && (
            <>
              <p className="mt-3 text-sm leading-relaxed text-navy/70">{p(t.auth.resetExpired)}</p>
              <Link to="/login" className="btn-pill-primary mt-6 w-full">
                {p(t.auth.back)}
              </Link>
            </>
          )}

          {ready === "ok" && done && (
            <p role="status" className="mt-3 text-sm font-semibold text-navy">
              {p(t.auth.resetDone)}
            </p>
          )}

          {ready === "ok" && !done && (
            <form onSubmit={save} className="mt-5 space-y-4">
              <div>
                <label htmlFor="new-password" className="font-display text-base font-extrabold text-navy">
                  {p(t.auth.newPassword)}
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={show ? "text" : "password"}
                    required
                    minLength={MIN_PASSWORD}
                    autoComplete="new-password"
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-2 min-h-12 w-full rounded-2xl border-2 border-navy/30 bg-white px-4 pe-12 font-semibold text-navy focus:border-flame focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? p(t.auth.hidePassword) : p(t.auth.showPassword)}
                    className="absolute end-2 top-1/2 flex h-10 w-10 -translate-y-[calc(50%-4px)] items-center justify-center rounded-full text-navy/70 hover:text-navy"
                  >
                    {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-navy/70">{p(t.auth.passwordHint)}</p>
              </div>
              <button type="submit" disabled={busy} className="btn-pill-primary w-full text-base">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {p(t.auth.saveNew)}
              </button>
              {error && (
                <p role="alert" className="text-center text-sm font-semibold text-red-700">
                  {error}
                </p>
              )}
            </form>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
