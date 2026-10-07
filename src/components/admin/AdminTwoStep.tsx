import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { useI18n } from "@/i18n";
import { supabase } from "@/lib/supabase";

/**
 * Supabase sends the QR code as an SVG "data:" address with the SVG text as is; some browsers
 * refuse that. Re-encode it so every browser shows it.
 */
function qrImage(raw: string) {
  const comma = raw.indexOf(",");
  if (!raw.startsWith("data:image/svg+xml") || comma < 0) return raw;
  let svg = raw.slice(comma + 1);
  try {
    if (/^%3C/i.test(svg)) svg = decodeURIComponent(svg);
  } catch {
    // not encoded after all: use as is
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

type State =
  | { mode: "loading" }
  | { mode: "verify"; factorId: string }
  | { mode: "setup"; factorId: string; qr: string; secret: string }
  | { mode: "failed"; message: string };

/**
 * Two-step login for staff areas (Supabase MFA, TOTP). First time: scan a QR code with
 * an authenticator app and confirm a code. After that: the 6-digit code at each sign-in.
 * Either way the session is upgraded (aal2), which the server requires for every staff endpoint.
 */
export function AdminTwoStep({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const { t, p } = useI18n();
  const [state, setState] = useState<State>({ mode: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  // No connection reads as a plain sentence, not "Failed to fetch".
  const friendly = (message: string) => (/fetch|network/i.test(message) ? p(t.misc.offline) : message);

  useEffect(() => {
    // Once per screen (React runs effects twice in development).
    if (started.current) return;
    started.current = true;
    void (async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) return setState({ mode: "failed", message: listError.message });
      const verified = data.totp[0];
      if (verified) return setState({ mode: "verify", factorId: verified.id });
      // A set-up that was never finished can't be reused (its QR code isn't shown again).
      for (const factor of data.all.filter((f) => f.factor_type === "totp" && f.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Be Right ${new Date().toISOString().slice(0, 10)}`,
      });
      if (enrollError) return setState({ mode: "failed", message: enrollError.message });
      setState({ mode: "setup", factorId: enrolled.id, qr: qrImage(enrolled.totp.qr_code), secret: enrolled.totp.secret });
    })();
  }, []);

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (state.mode !== "verify" && state.mode !== "setup") return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: state.factorId, code: code.trim() });
    setBusy(false);
    if (verifyError) {
      setCode("");
      return setError(p(t.admin.twoStepWrong));
    }
    onDone();
  }

  const codeForm = (
    <form onSubmit={confirm} className="flex flex-col gap-3">
      <label htmlFor="two-step-code" className="text-sm font-bold text-navy">
        {p(t.admin.twoStepCode)}
      </label>
      <input
        id="two-step-code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        dir="ltr"
        autoFocus
        placeholder="000000"
        className="min-h-12 rounded-2xl border-2 border-navy/30 bg-white px-4 text-center font-display text-2xl font-black tracking-[0.4em] text-navy placeholder:text-navy/20 focus:border-flame focus:outline-none"
      />
      <button type="submit" disabled={busy || code.length !== 6} className="btn-pill-primary justify-center disabled:opacity-40">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {p(t.admin.twoStepConfirm)}
      </button>
      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
    </form>
  );

  return (
    <div className="card-br flex w-full max-w-md flex-col gap-4 !rounded-[28px] p-6 sm:p-8">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy text-white">
        <ShieldCheck className="h-6 w-6" />
      </span>
      <h1 className="font-display text-2xl font-black text-navy">{p(t.admin.twoStepTitle)}</h1>

      {state.mode === "loading" && <Loader2 className="h-6 w-6 animate-spin text-navy" />}

      {state.mode === "failed" && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {friendly(state.message)}
        </p>
      )}

      {state.mode === "verify" && (
        <>
          <p className="text-sm leading-relaxed text-navy/70">{p(t.admin.twoStepVerifySub)}</p>
          {codeForm}
          <p className="text-xs leading-relaxed text-navy/60">{p(t.admin.twoStepLost)}</p>
        </>
      )}

      {state.mode === "setup" && (
        <>
          <p className="text-sm leading-relaxed text-navy/70">{p(t.admin.twoStepSetupSub)}</p>
          <ol className="flex flex-col gap-4 text-sm text-navy">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-flame text-xs font-black text-white">1</span>
              {p(t.admin.twoStepInstall)}
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-flame text-xs font-black text-white">2</span>
              <div className="min-w-0 flex-1">
                {p(t.admin.twoStepScan)}
                <img
                  src={state.qr}
                  alt=""
                  width={176}
                  height={176}
                  className="mx-auto mt-3 h-44 w-44 rounded-2xl border border-navy/10 bg-white p-2"
                />
                <p className="mt-3 text-xs text-navy/60">{p(t.admin.twoStepManual)}</p>
                <p dir="ltr" className="mt-1 select-all break-all rounded-xl bg-navy/5 px-3 py-2 text-center font-mono text-sm font-bold text-navy">
                  {state.secret}
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-flame text-xs font-black text-white">3</span>
              {p(t.admin.twoStepType)}
            </li>
          </ol>
          {codeForm}
        </>
      )}

      <button type="button" onClick={onSignOut} className="text-sm font-bold text-navy/70 underline underline-offset-4">
        {p(t.nav.logout)}
      </button>
    </div>
  );
}
