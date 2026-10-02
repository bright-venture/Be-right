import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { HOME_BY_ROLE, isStaff, type Role } from "@contracts/roles";

export function Navbar() {
  const { lang, setLang, t, p } = useI18n();
  const { user, isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const role = user?.role as Role | undefined;
  const staff = !!role && isStaff(role);
  // Each role sees only its own area: My requests / Jobs / Dashboard.
  const area = role
    ? {
        to: HOME_BY_ROLE[role],
        label: p({ customer: t.nav.myRequests, technician: t.nav.jobs, specialist: t.nav.dashboard }[role]),
      }
    : null;

  const links = [
    { href: "/#services", label: p(t.nav.services) },
    { href: "/#how", label: p(t.nav.how) },
    { href: "/#why", label: p(t.nav.why) },
    { href: "/#trust", label: p(t.nav.trust) },
  ];
  const menuItem = "flex min-h-11 items-center rounded-2xl px-4 font-semibold text-navy hover:bg-white";

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b-2 border-navy bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/" className="flex min-h-11 shrink-0 items-center gap-2">
          <img
            src="/assets/wordmark.webp"
            width={239}
            height={96}
            alt="Be Right"
            className="h-9 w-auto"
          />
          <span className="hidden whitespace-nowrap font-display text-[11px] font-bold uppercase tracking-[0.2em] text-navy/70 xl:block">
            {p(t.brandByline)}
          </span>
        </Link>

        <nav className={`hidden items-center gap-1 ${isAuthenticated ? "" : "lg:flex"}`}>
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold text-navy transition-all duration-200 hover:-rotate-2 hover:bg-white"
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/join"
            className="whitespace-nowrap rounded-full border-2 border-dashed border-navy/40 px-4 py-2 text-sm font-semibold text-navy/70 transition-all duration-200 hover:border-navy hover:text-navy"
          >
            {p(t.nav.join)}
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            className="min-h-11 whitespace-nowrap rounded-full border-2 border-navy bg-white px-4 text-sm font-bold text-navy transition-colors hover:bg-navy hover:text-paper"
            lang={lang === "en" ? "ar" : "en"}
          >
            {p(t.misc.langName)}
          </button>

          {isAuthenticated ? (
            <>
              {area && !staff && (
                <Link
                  to={area.to}
                  className="hidden min-h-11 items-center whitespace-nowrap rounded-full px-3 text-sm font-semibold text-navy hover:bg-white sm:inline-flex"
                >
                  {area.label}
                </Link>
              )}
              <button
                onClick={() => logout()}
                className="hidden min-h-11 whitespace-nowrap rounded-full px-3 text-sm font-semibold text-navy/70 hover:text-navy sm:block"
              >
                {p(t.nav.logout)}
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="hidden min-h-11 whitespace-nowrap rounded-full px-3 text-sm font-semibold text-navy hover:bg-white sm:block"
            >
              {p(t.nav.login)}
            </button>
          )}

          {/* Primary action: staff go to their workspace; everyone else books. */}
          {staff && area ? (
            <Link to={area.to} className="btn-pill-primary !min-h-11 whitespace-nowrap !px-5 !py-2">
              {area.label}
            </Link>
          ) : (
            <Link to="/book" className="btn-pill-primary !min-h-11 whitespace-nowrap !px-5 !py-2">
              {p(t.nav.book)}
            </Link>
          )}

          <button
            className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border-2 border-navy bg-white text-navy ${isAuthenticated ? "" : "lg:hidden"}`}
            onClick={() => setOpen(!open)}
            aria-label={p(t.nav.menu)}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className={`border-t-2 border-navy bg-paper px-4 py-4 ${isAuthenticated ? "" : "lg:hidden"}`}>
          <div className="flex flex-col gap-1">
            {area && (
              <Link to={area.to} onClick={() => setOpen(false)} className={menuItem}>
                {area.label}
              </Link>
            )}
            {isAuthenticated && (
              <Link to="/account" onClick={() => setOpen(false)} className={menuItem}>
                {p(t.nav.account)}
              </Link>
            )}
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className={menuItem}>
                {l.label}
              </a>
            ))}
            <Link
              to="/join"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center rounded-2xl px-4 font-semibold text-navy/70 hover:bg-white"
            >
              {p(t.nav.join)}
            </Link>
            {isAuthenticated ? (
              <button
                onClick={() => logout()}
                className="flex min-h-11 items-center rounded-2xl px-4 text-start font-semibold text-navy/70 hover:bg-white"
              >
                {p(t.nav.logout)}
              </button>
            ) : (
              <>
                <Link to="/login" onClick={() => setOpen(false)} className={menuItem}>
                  {p(t.nav.login)}
                </Link>
                <Link to="/signup" onClick={() => setOpen(false)} className={menuItem}>
                  {p(t.nav.signup)}
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
