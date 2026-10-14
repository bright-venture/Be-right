import type { ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router";
import {
  BadgeCheck,
  ChevronRight,
  FileText,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  ShieldCheck,
  Trash2,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useRoleGate } from "@/hooks/useRoleGate";
import { canDispatch, ROLES } from "@contracts/roles";
import { DeleteAccount, Details, EmailChange, PasswordChange } from "./Account";

/** Screens one level down (/account/details …): each one is the same form as the website's. */
const SECTIONS = ["details", "email", "password", "delete"] as const;
type Section = (typeof SECTIONS)[number];

const GROUP = "overflow-hidden rounded-3xl border border-navy/10 bg-white";
const GROUP_TITLE = "mb-2 px-1 text-xs font-bold uppercase tracking-[0.14em] text-navy/50";

function initials(name: string | null | undefined, email: string | null | undefined) {
  const source = name?.trim() || email || "BR";
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** One row of a settings group: an icon, a label, maybe a value, and where it leads. */
function Row({
  to,
  icon: Icon,
  label,
  value,
  tone = "navy",
  first = false,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  value?: ReactNode;
  tone?: "navy" | "danger";
  first?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex min-h-14 items-center gap-3 px-4 active:bg-navy/5 ${first ? "" : "border-t border-navy/10"}`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-navy/5 text-navy"
        }`}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className={`flex-1 text-sm font-bold ${tone === "danger" ? "text-destructive" : "text-navy"}`}>{label}</span>
      {value && <span className="max-w-[45%] truncate text-xs text-navy/50">{value}</span>}
      <ChevronRight className="h-4 w-4 shrink-0 text-navy/30 rtl:-scale-x-100" />
    </Link>
  );
}

/**
 * The phone app's account screen, laid out like a phone's settings: who you are, then
 * grouped rows (account, language, help), sign out, and account deletion for customers.
 */
export default function AppAccount() {
  const { t, p, lang, setLang } = useI18n();
  const { user, isLoading } = useRoleGate(ROLES, { requireSignIn: true });
  const { logout, isLoading: signingOut } = useAuth();
  const section = useParams().section as Section | undefined;
  const canDelete = !!user && (user.role === "customer" || canDispatch(user.role));

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Loader2 className="h-8 w-8 animate-spin text-navy" />
      </div>
    );
  }

  // One level down: the form for that setting, with the top bar's Back button.
  if (section) {
    if (!SECTIONS.includes(section) || (section === "delete" && !canDelete)) {
      return <Navigate to="/account" replace />;
    }
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        <Navbar />
        {/* app style: the form buttons take the full width */}
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pt-20 [&_button]:w-full [&_button]:justify-center">
          {section === "details" && <Details key={user.id} name={user.name ?? ""} phone={user.phone ?? ""} />}
          {section === "email" && <EmailChange current={user.email ?? ""} />}
          {section === "password" && <PasswordChange email={user.email ?? ""} />}
          {section === "delete" && <DeleteAccount staff={canDispatch(user.role)} />}
        </main>
        <Footer />
      </div>
    );
  }

  const role = {
    customer: t.app.roleCustomer,
    technician: t.app.roleTechnician,
    specialist: t.app.roleSpecialist,
    admin: t.app.roleAdmin,
  }[
    user.role as (typeof ROLES)[number]
  ];

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 pt-20">
        <h1 className="pt-2 font-display text-[28px] font-black tracking-tight text-navy">{p(t.account.title)}</h1>

        {/* who you are */}
        <section className="-mt-2 flex items-center gap-4 rounded-3xl bg-navy p-5 text-white">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-flame font-display text-xl font-black">
            {initials(user.name, user.email)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-extrabold">{user.name || user.email}</p>
            <p className="truncate text-xs text-white/70 rtl:text-right" dir="ltr">
              {user.email}
            </p>
            {user.phone && (
              <p className="truncate text-xs text-white/70 rtl:text-right" dir="ltr">
                {user.phone}
              </p>
            )}
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold">
              <BadgeCheck className="h-3.5 w-3.5" />
              {p(role)}
            </span>
          </div>
        </section>

        {/* account */}
        <section>
          <h2 className={GROUP_TITLE}>{p(t.app.accountGroup)}</h2>
          <div className={GROUP}>
            <Row first to="/account/details" icon={UserRound} label={p(t.account.details)} value={user.name} />
            <Row to="/account/email" icon={Mail} label={p(t.account.email)} value={<span dir="ltr">{user.email}</span>} />
            <Row to="/account/password" icon={KeyRound} label={p(t.account.password)} />
          </div>
        </section>

        {/* language: two equal halves */}
        <section>
          <h2 className={GROUP_TITLE}>{p(t.app.language)}</h2>
          <div role="radiogroup" aria-label={p(t.app.language)} className="grid grid-cols-2 gap-1 rounded-2xl bg-navy/5 p-1">
            {(
              [
                ["en", "English"],
                ["ar", "العربية"],
              ] as const
            ).map(([code, label]) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={lang === code}
                lang={code}
                onClick={() => setLang(code)}
                className={`min-h-11 rounded-xl text-sm font-bold transition-colors ${
                  lang === code ? "bg-white text-navy shadow-[0_2px_8px_rgb(12_43_92/0.1)]" : "text-navy/60"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* help and information */}
        <section>
          <h2 className={GROUP_TITLE}>{p(t.app.help)}</h2>
          <div className={GROUP}>
            <Row first to="/guarantee" icon={ShieldCheck} label={p(t.nav.guarantee)} />
            <Row to="/checks" icon={BadgeCheck} label={p(t.trustRow.checksTitle)} />
            {user.role === "customer" && <Row to="/join" icon={Wrench} label={p(t.nav.join)} />}
            <Row to="/terms" icon={FileText} label={p(t.legal.terms)} />
            <Row to="/privacy" icon={FileText} label={p(t.legal.privacy)} />
          </div>
        </section>

        {/* sign out */}
        <button
          type="button"
          onClick={() => void logout()}
          disabled={signingOut}
          className="flex min-h-14 items-center justify-center gap-2 rounded-3xl border border-navy/10 bg-white text-sm font-bold text-navy active:bg-navy/5"
        >
          {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4 rtl:-scale-x-100" />}
          {p(t.nav.logout)}
        </button>

        {/* leaving for good: technicians' accounts are closed by the team (jobs and hiring records) */}
        {canDelete ? (
          <div className={GROUP}>
            <Row first to="/account/delete" icon={Trash2} label={p(t.account.deleteTitle)} tone="danger" />
          </div>
        ) : (
          <p className="px-1 text-xs text-navy/60">{p(t.account.staffNote)}</p>
        )}
      </main>
      <Footer />
    </div>
  );
}
