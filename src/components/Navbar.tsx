import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Globe, Menu, X } from "lucide-react";
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
    { href: "/#coverage", label: p(t.nav.coverage) },
    { href: "/guarantee", label: p(t.nav.guarantee), route: true },
  ];
  const navLink =
    "rounded-full px-3 py-2 font-display text-[13px] font-semibold text-navy/80 transition-colors duration-200 hover:bg-navy hover:text-paper";
  const menuItem =
    "flex min-h-11 items-center rounded-2xl px-4 font-display text-sm font-bold uppercase tracking-wider text-navy hover:bg-white";
  const switchLang = () => setLang(lang === "en" ? "ar" : "en");
  const langButton = (className: string, onClick = switchLang) => (
    <button onClick={onClick} className={className} lang={lang === "en" ? "ar" : "en"}>
      <Globe className="h-4 w-4" aria-hidden />
      {p(t.misc.langName)}
    </button>
  );

  return (
    <header className="glass fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/" className="flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap">
          <img
            src="/assets/wordmark.png"
            width={600}
            height={222}
            alt="Be Right"
            className="h-9 w-auto transition-transform duration-200 hover:-rotate-2"
          />
          <span className="hidden rounded-full bg-navy px-2.5 py-1 font-display text-[10px] font-black uppercase tracking-[0.18em] text-paper xl:block">
            {p(t.brandByline)}
          </span>
        </Link>

        <nav className={`hidden items-center gap-0.5 whitespace-nowrap ${isAuthenticated ? "" : "lg:flex"}`}>
          {links.map((l) =>
            l.route ? (
              <Link key={l.href} to={l.href} className={navLink}>
                {l.label}
              </Link>
            ) : (
              <a key={l.href} href={l.href} className={navLink}>
                {l.label}
              </a>
            ),
          )}
          <Link
            to="/join"
            className="rounded-full border-[1.5px] border-navy/15 px-3 py-1.5 font-display text-[13px] font-semibold text-navy/80 transition-all duration-200 hover:border-flame hover:text-flame"
          >
            {p(t.nav.join)}
          </Link>
          {/* Discreet language switch inside the header menu */}
          {langButton("flex items-center gap-1.5 rounded-full px-2.5 py-2 text-[13px] font-bold text-navy/70 transition-colors duration-200 hover:text-flame")}
        </nav>

        <div className="flex items-center gap-2 whitespace-nowrap">
          {isAuthenticated ? (
            <>
              {/* Signed in, the section links above are hidden: keep the language switch reachable. */}
              {langButton("hidden min-h-11 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-bold text-navy/70 transition-colors hover:text-flame sm:flex")}
              {area && !staff && (
                <Link
                  to={area.to}
                  className="hidden min-h-11 items-center whitespace-nowrap rounded-full px-3 font-display text-sm font-semibold text-navy hover:bg-white sm:inline-flex"
                >
                  {area.label}
                </Link>
              )}
              <button
                onClick={() => logout()}
                className="hidden min-h-11 whitespace-nowrap rounded-full px-3 text-sm font-semibold text-navy/80 hover:text-navy sm:block"
              >
                {p(t.nav.logout)}
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="hidden min-h-11 whitespace-nowrap rounded-full px-3 font-display text-sm font-semibold text-navy hover:bg-white sm:block"
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
            className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-navy bg-white text-navy shadow-[0_3px_0_rgb(12_43_92/1)] ${isAuthenticated ? "" : "lg:hidden"}`}
            onClick={() => setOpen(!open)}
            aria-label={p(t.nav.menu)}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className={`border-t-[1.5px] border-navy/15 bg-paper px-4 py-4 ${isAuthenticated ? "" : "lg:hidden"}`}>
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
            {links.map((l) =>
              l.route ? (
                <Link key={l.href} to={l.href} onClick={() => setOpen(false)} className={menuItem}>
                  {l.label}
                </Link>
              ) : (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)} className={menuItem}>
                  {l.label}
                </a>
              ),
            )}
            <Link
              to="/join"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center rounded-2xl px-4 font-semibold text-navy/80 hover:bg-white"
            >
              {p(t.nav.join)}
            </Link>
            {isAuthenticated ? (
              <button
                onClick={() => logout()}
                className="flex min-h-11 items-center rounded-2xl px-4 text-start font-semibold text-navy/80 hover:bg-white"
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
            {/* Discreet language switch inside the mobile menu */}
            {langButton(
              "mt-1 flex min-h-11 items-center gap-2 rounded-2xl border-t-[1.5px] border-navy/10 px-4 pt-3 text-sm font-bold text-navy/70 hover:text-flame",
              () => {
                switchLang();
                setOpen(false);
              },
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
