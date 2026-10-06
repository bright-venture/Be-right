import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { Eye, EyeOff, Loader2, Mail } from "lucide-react";
import type { AuthError } from "@supabase/supabase-js";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { AgreeCheckbox } from "@/components/AgreeCheckbox";
import { LEGAL_VERSION } from "@contracts/legal";
import { isValidPhone } from "@contracts/phone";
import { siteOrigin } from "@/lib/native";

const INPUT =
  "mt-2 min-h-12 w-full rounded-2xl border-2 border-navy/30 bg-white px-4 font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none";
const LABEL = "font-display text-base font-extrabold text-navy";
const LINK = "text-sm font-bold text-navy/70 underline underline-offset-4 hover:text-navy";
const MIN_PASSWORD = 8;
const GOOGLE_ENABLED = import.meta.env.VITE_AUTH_GOOGLE === "true";

export type AuthMode = "signin" | "signup";
type View = AuthMode | "forgot" | "code";
/** A step that waits on an email the user must open. */
type Pending = { kind: "confirm" | "reset" | "code"; email: string } | null;

/**
 * Sign in / create account with email + password, plus "forgot password" and a
 * passwordless email-code fallback. After success Supabase fires SIGNED_IN, which
 * refreshes the app's user; callers react to that (redirect, show submit, …).
 */
export function AuthPanel({
  next,
  initialMode = "signin",
  headingLevel = "h2",
}: {
  /** Path to return to after email links (confirmation, code link, password reset). */
  next: string;
  initialMode?: AuthMode;
  headingLevel?: "h1" | "h2" | "h3";
}) {
  const { t, p } = useI18n();
  const [view, setView] = useState<View>(initialMode);
  const [pending, setPending] = useState<Pending>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Email links open the website (from the app too: the app has no web address of its own).
  const origin = siteOrigin();
  const returnUrl = `${origin}${next}`;
  const resetUrl = `${origin}/reset-password?next=${encodeURIComponent(next)}`;
  const Heading = headingLevel;
  const fill = (text: { en: string; ar: string }, value: string) => p(text).replace("{email}", value);

  function go(v: View) {
    setView(v);
    setError(null);
    setNotice(null);
    setUnconfirmed(false);
    setPending(null);
  }

  function explain(err: AuthError) {
    switch (err.code) {
      case "invalid_credentials":
        return p(t.auth.errInvalid);
      case "email_not_confirmed":
        setUnconfirmed(true);
        return p(t.auth.errNotConfirmed);
      case "user_already_exists":
      case "email_exists":
        return p(t.auth.errExists);
      case "otp_disabled":
      case "signup_disabled":
        return p(t.auth.errNoAccount);
      case "weak_password":
        return p(t.auth.errWeak);
      case "over_email_send_rate_limit":
        return p(t.auth.errEmailRate);
      case "over_request_rate_limit":
        return p(t.auth.errRate);
      default:
        return err.message || p(t.auth.errGeneric);
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch {
      setError(p(t.auth.errGeneric));
    } finally {
      setBusy(false);
    }
  }

  const cleanEmail = () => email.trim().toLowerCase();

  const onSignIn = (e: FormEvent) => {
    e.preventDefault();
    setUnconfirmed(false);
    return run(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail(), password });
      if (error) setError(explain(error));
    });
  };

  const onSignUp = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidPhone(phone)) return setError(p(t.misc.phoneInvalid));
    if (password.length < MIN_PASSWORD) return setError(p(t.auth.errWeak));
    if (!agreed) return setError(p(t.legal.mustAgree));
    return run(async () => {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail(),
        password,
        options: {
          emailRedirectTo: returnUrl,
          data: { full_name: name.trim(), phone: phone.trim(), terms_version: LEGAL_VERSION },
        },
      });
      if (error) return setError(explain(error));
      // With email confirmation on, an existing address comes back with no identities.
      if (data.user && data.user.identities?.length === 0) return setError(p(t.auth.errExists));
      if (!data.session) setPending({ kind: "confirm", email: cleanEmail() });
    });
  };

  const onResendConfirmation = () =>
    run(async () => {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: cleanEmail(),
        options: { emailRedirectTo: returnUrl },
      });
      if (error) setError(explain(error));
      else setNotice(p(t.auth.resent));
    });

  const onForgot = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail(), {
        redirectTo: resetUrl,
      });
      if (error) setError(explain(error));
      else setPending({ kind: "reset", email: cleanEmail() });
    });
  };

  const onSendCode = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail(),
        options: { emailRedirectTo: returnUrl, shouldCreateUser: false },
      });
      if (error) setError(explain(error));
      else setPending({ kind: "code", email: cleanEmail() });
    });
  };

  const onVerifyCode = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const { error } = await supabase.auth.verifyOtp({
        email: cleanEmail(),
        token: code.trim(),
        type: "email",
      });
      if (error) setError(explain(error));
    });
  };

  const onGoogle = () =>
    run(async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: returnUrl },
      });
      if (error) setError(explain(error));
    });

  const submit = (label: string) => (
    <button type="submit" disabled={busy} className="btn-pill-primary w-full text-base">
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </button>
  );

  const emailField = (
    <div>
      <label htmlFor="auth-email" className={LABEL}>
        {p(t.auth.email)}
      </label>
      <input
        id="auth-email"
        type="email"
        required
        autoComplete="email"
        dir="ltr"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className={INPUT}
      />
    </div>
  );

  const passwordField = (autoComplete: "current-password" | "new-password", label: ReactNode) => (
    <div>
      <label htmlFor="auth-password" className={LABEL}>
        {label}
      </label>
      <div className="relative">
        <input
          id="auth-password"
          type={showPassword ? "text" : "password"}
          required
          minLength={autoComplete === "new-password" ? MIN_PASSWORD : undefined}
          autoComplete={autoComplete}
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`${INPUT} pe-12`}
        />
        <button
          type="button"
          onClick={() => setShowPassword((s) => !s)}
          aria-label={showPassword ? p(t.auth.hidePassword) : p(t.auth.showPassword)}
          className="absolute end-2 top-1/2 flex h-10 w-10 -translate-y-[calc(50%-4px)] items-center justify-center rounded-full text-navy/70 hover:text-navy"
        >
          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
      {autoComplete === "new-password" && (
        <p className="mt-1 text-xs text-navy/70">{p(t.auth.passwordHint)}</p>
      )}
    </div>
  );

  /* ---------- waiting on an email ---------- */
  if (pending) {
    const body =
      pending.kind === "confirm"
        ? fill(t.auth.confirmBody, pending.email)
        : pending.kind === "reset"
          ? fill(t.auth.resetSent, pending.email)
          : fill(t.auth.codeSent, pending.email);
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-navy bg-paper text-flame">
            <Mail className="h-6 w-6" />
          </span>
          <Heading className="mt-3 font-display text-2xl font-black text-navy">
            {pending.kind === "confirm"
              ? p(t.auth.confirmTitle)
              : pending.kind === "reset"
                ? p(t.auth.forgotTitle)
                : p(t.auth.codeTitle)}
          </Heading>
          <p className="mt-2 text-sm leading-relaxed text-navy/70">{body}</p>
        </div>

        {pending.kind === "code" && (
          <form onSubmit={onVerifyCode} className="space-y-4">
            <div>
              <label htmlFor="auth-code" className={LABEL}>
                {p(t.auth.code)}
              </label>
              <input
                id="auth-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="123456"
                className={`${INPUT} text-center tracking-[0.4em]`}
              />
            </div>
            {submit(p(t.auth.signIn))}
          </form>
        )}

        {pending.kind === "confirm" && (
          <button type="button" onClick={onResendConfirmation} disabled={busy} className={`${LINK} block w-full`}>
            {p(t.auth.resend)}
          </button>
        )}
        <button type="button" onClick={() => go("signin")} className={`${LINK} block w-full`}>
          {p(t.auth.back)}
        </button>
        <Messages error={error} notice={notice} />
      </div>
    );
  }

  return (
    <div>
      <div>
        <Heading className="font-display text-2xl font-black text-navy">
          {view === "signup"
            ? p(t.auth.signUpTitle)
            : view === "forgot"
              ? p(t.auth.forgotTitle)
              : view === "code"
                ? p(t.auth.codeTitle)
                : p(t.auth.signInTitle)}
        </Heading>
        <p className="mt-1 text-sm leading-relaxed text-navy/70">
          {view === "signup"
            ? p(t.auth.signUpSub)
            : view === "forgot"
              ? p(t.auth.forgotSub)
              : p(t.auth.signInSub)}
        </p>
      </div>

      {view === "signin" && (
        <form onSubmit={onSignIn} className="mt-5 space-y-4">
          {emailField}
          {passwordField("current-password", p(t.auth.password))}
          <div className="flex justify-end">
            <button type="button" onClick={() => go("forgot")} className={LINK}>
              {p(t.auth.forgot)}
            </button>
          </div>
          {submit(p(t.auth.signIn))}
          {unconfirmed && (
            <button type="button" onClick={onResendConfirmation} disabled={busy} className={`${LINK} block w-full`}>
              {p(t.auth.resend)}
            </button>
          )}
          <button type="button" onClick={() => go("code")} className={`${LINK} block w-full`}>
            {p(t.auth.useCode)}
          </button>
        </form>
      )}

      {view === "signup" && (
        <form onSubmit={onSignUp} className="mt-5 space-y-4">
          <div>
            <label htmlFor="auth-name" className={LABEL}>
              {p(t.auth.name)}
            </label>
            <input
              id="auth-name"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={p(t.auth.namePh)}
              className={INPUT}
            />
          </div>
          {emailField}
          <div>
            <label htmlFor="auth-phone" className={LABEL}>
              {p(t.auth.phone)}
            </label>
            <input
              id="auth-phone"
              type="tel"
              required
              autoComplete="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+961 70 000 000"
              className={INPUT}
            />
            <p className="mt-1 text-xs text-navy/70">{p(t.auth.phoneHint)}</p>
          </div>
          {passwordField("new-password", p(t.auth.password))}
          <AgreeCheckbox id="auth-agree" text={t.legal.agreeSignup} checked={agreed} onChange={setAgreed} />
          {submit(p(t.auth.signUp))}
        </form>
      )}

      {view === "forgot" && (
        <form onSubmit={onForgot} className="mt-5 space-y-4">
          {emailField}
          {submit(p(t.auth.sendReset))}
          <button type="button" onClick={() => go("signin")} className={`${LINK} block w-full`}>
            {p(t.auth.back)}
          </button>
        </form>
      )}

      {view === "code" && (
        <form onSubmit={onSendCode} className="mt-5 space-y-4">
          {emailField}
          {submit(p(t.auth.sendCode))}
          <button type="button" onClick={() => go("signin")} className={`${LINK} block w-full`}>
            {p(t.auth.usePassword)}
          </button>
        </form>
      )}

      {GOOGLE_ENABLED && (view === "signin" || view === "signup") && (
        <button type="button" onClick={onGoogle} disabled={busy} className="btn-pill-outline mt-3 w-full text-base">
          {p(t.auth.google)}
        </button>
      )}

      <Messages error={error} notice={notice} />

      {/* Switch between signing in and creating a (customer) account */}
      {view === "signin" && (
        <p className="mt-6 border-t-2 border-navy/10 pt-5 text-center text-sm text-navy/70">
          {p(t.auth.noAccount)}{" "}
          <button type="button" onClick={() => go("signup")} className="font-bold text-navy underline underline-offset-4">
            {p(t.auth.createCustomer)}
          </button>
        </p>
      )}
      {view === "signup" && (
        <div className="mt-6 space-y-2 border-t-2 border-navy/10 pt-5 text-center text-sm text-navy/70">
          <p>
            {p(t.auth.haveAccount)}{" "}
            <button type="button" onClick={() => go("signin")} className="font-bold text-navy underline underline-offset-4">
              {p(t.auth.signIn)}
            </button>
          </p>
          <p>
            {p(t.auth.techApply)}{" "}
            <Link to="/join" className="font-bold text-navy underline underline-offset-4">
              {p(t.auth.applyLink)}
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}

function Messages({ error, notice }: { error: string | null; notice: string | null }) {
  if (!error && !notice) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={`mt-4 text-center text-sm font-semibold ${error ? "text-red-700" : "text-navy"}`}
    >
      {error ?? notice}
    </p>
  );
}
