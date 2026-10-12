import { useState, type FormEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useI18n } from "@/i18n";
import { useRoleGate } from "@/hooks/useRoleGate";
import { trpc } from "@/providers/trpc";
import { supabase } from "@/lib/supabase";
import { isNetworkError, refusalMessage } from "@/lib/errors";
import { ACCOUNT_DELETED_FLAG } from "@/lib/session";
import { isValidPhone } from "@contracts/phone";
import { ROLES } from "@contracts/roles";
import { siteOrigin } from "@/lib/native";

const INPUT =
  "mt-2 min-h-12 w-full rounded-2xl border-2 border-navy/30 bg-white px-4 font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none";
const LABEL = "font-display text-sm font-extrabold text-navy";
const MIN_PASSWORD = 8;

/** Every signed-in role: details and password. Customers can also delete their account. */
export default function Account() {
  const { t, p } = useI18n();
  const { user, isLoading } = useRoleGate(ROLES, { requireSignIn: true });

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Loader2 className="h-8 w-8 animate-spin text-navy" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pb-20 pt-24 sm:px-6">
        <h1 className="font-display text-3xl font-black text-navy sm:text-4xl">{p(t.account.title)}</h1>
        <Details key={user.id} name={user.name ?? ""} phone={user.phone ?? ""} />
        <EmailChange current={user.email ?? ""} />
        <PasswordChange email={user.email ?? ""} />
        {user.role === "customer" ? (
          <DeleteAccount />
        ) : (
          <p className="text-sm text-navy/70">{p(t.account.staffNote)}</p>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card-br p-5 sm:p-6">
      <h2 className="font-display text-lg font-extrabold text-navy">{title}</h2>
      {children}
    </section>
  );
}

function Status({ ok, error }: { ok?: string | null; error?: string | null }) {
  if (error) return <p role="alert" className="mt-3 text-sm font-semibold text-destructive">{error}</p>;
  if (ok) return <p role="status" className="mt-3 text-sm font-semibold text-green-800">{ok}</p>;
  return null;
}

export function Details({ name: initialName, phone: initialPhone }: { name: string; phone: string }) {
  const { t, p } = useI18n();
  const utils = trpc.useUtils();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const save = trpc.auth.updateProfile.useMutation({ onSuccess: () => utils.auth.me.invalidate() });
  const nameOk = name.trim().length >= 2;
  const phoneOk = isValidPhone(phone);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (nameOk && phoneOk) save.mutate({ name: name.trim(), phone: phone.trim() });
  }

  return (
    <Section title={p(t.account.details)}>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor="account-name" className={LABEL}>{p(t.auth.name)}</label>
          <input id="account-name" autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); save.reset(); }} className={INPUT} />
          {name.trim() !== "" && !nameOk && <p className="mt-1 text-sm font-semibold text-destructive">{p(t.account.nameTooShort)}</p>}
        </div>
        <div>
          <label htmlFor="account-phone" className={LABEL}>{p(t.auth.phone)}</label>
          <input
            id="account-phone"
            type="tel"
            autoComplete="tel"
            dir="ltr"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); save.reset(); }}
            placeholder="+1 202 555 0123"
            aria-invalid={phone.trim() !== "" && !phoneOk ? true : undefined}
            className={INPUT}
          />
          {phone.trim() !== "" && !phoneOk && <p className="mt-1 text-sm font-semibold text-destructive">{p(t.misc.phoneInvalid)}</p>}
        </div>
        <button type="submit" disabled={save.isPending || !nameOk || !phoneOk} className="btn-pill-primary self-start disabled:opacity-40">
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {p(t.account.save)}
        </button>
      </form>
      <Status ok={save.isSuccess ? p(t.account.saved) : null} error={save.error ? refusalMessage(save.error) ?? p(t.misc.error) : null} />
    </Section>
  );
}

export function EmailChange({ current }: { current: string }) {
  const { t, p } = useI18n();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.trim().toLowerCase() !== current.toLowerCase();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    setOk(false);
    // Supabase sends a confirmation link to both addresses; the change happens once confirmed.
    const { error: err } = await supabase.auth.updateUser(
      { email: email.trim() },
      { emailRedirectTo: `${siteOrigin()}/account` },
    );
    setBusy(false);
    if (err) setError(err.message || p(t.misc.error));
    else setOk(true);
  }

  return (
    <Section title={p(t.account.email)}>
      <p className="mt-2 text-sm text-navy/70" dir="ltr">{current}</p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <div>
          <label htmlFor="account-email" className={LABEL}>{p(t.account.emailNew)}</label>
          <input id="account-email" type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
        </div>
        <button type="submit" disabled={busy || !valid} className="btn-pill-outline self-start disabled:opacity-40">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {p(t.account.emailChange)}
        </button>
      </form>
      <Status ok={ok ? p(t.account.emailSent) : null} error={error} />
    </Section>
  );
}

export function PasswordChange({ email }: { email: string }) {
  const { t, p } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!current || next.length < MIN_PASSWORD) return;
    setBusy(true);
    setError(null);
    setOk(false);
    // Check the current password first, so an unattended signed-in phone can't be taken over.
    const check = await supabase.auth.signInWithPassword({ email, password: current });
    if (check.error) {
      setBusy(false);
      setError(p(t.account.passwordWrong));
      return;
    }
    const { error: err } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (err) {
      setError(err.code === "weak_password" || err.code === "same_password" ? p(t.auth.errWeak) : err.message || p(t.misc.error));
      return;
    }
    setOk(true);
    setCurrent("");
    setNext("");
  }

  return (
    <Section title={p(t.account.password)}>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor="account-current" className={LABEL}>{p(t.account.passwordCurrent)}</label>
          <input id="account-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label htmlFor="account-new" className={LABEL}>{p(t.account.passwordNew)}</label>
          <input id="account-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={INPUT} />
        </div>
        <button type="submit" disabled={busy || !current || next.length < MIN_PASSWORD} className="btn-pill-outline self-start disabled:opacity-40">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {p(t.account.passwordSave)}
        </button>
      </form>
      <Status ok={ok ? p(t.account.passwordChanged) : null} error={error} />
    </Section>
  );
}

export function DeleteAccount() {
  const { t, p } = useI18n();
  const [understood, setUnderstood] = useState(false);
  const remove = trpc.auth.deleteAccount.useMutation({
    onSuccess: async () => {
      try {
        sessionStorage.setItem(ACCOUNT_DELETED_FLAG, "1");
      } catch {
        // The notice is a nicety.
      }
      // The sign-in no longer exists on the server: just forget it on this device.
      await supabase.auth.signOut({ scope: "local" });
      window.location.replace("/");
    },
  });
  const error = remove.error
    ? isNetworkError(remove.error)
      ? p(t.misc.offline)
      : (refusalMessage(remove.error) ?? p(t.misc.error))
    : null;

  return (
    <section className="card-br !border-red-700 p-5 sm:p-6">
      <h2 className="font-display text-lg font-extrabold text-red-700">{p(t.account.deleteTitle)}</h2>
      <p className="mt-2 text-sm leading-relaxed text-navy/80">{p(t.account.deleteIntro)}</p>
      <label className="mt-4 flex items-start gap-3 text-sm font-semibold text-navy">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 h-5 w-5 accent-red-700" />
        {p(t.account.deleteUnderstand)}
      </label>
      <button
        onClick={() => {
          if (window.confirm(p(t.account.deleteAsk))) remove.mutate();
        }}
        disabled={!understood || remove.isPending}
        className="btn-pill-outline mt-4 !border-red-700 !text-red-700 disabled:opacity-40"
      >
        {remove.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {p(t.account.deleteTitle)}
      </button>
      <Status error={error} />
    </section>
  );
}
