import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronDown, ClipboardList, Globe, LogOut, Menu, UserRound, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { HOME_BY_ROLE, isStaff, type Role } from "@contracts/roles";
import { isAppUi } from "@/lib/native";
import { AppTopBar } from "@/components/app/AppChrome";

/** The website header. In the phone app, the app top bar takes its place (src/lib/native.ts). */
export function Navbar() {
  return isAppUi ? <AppTopBar /> : <WebNavbar />;
}

function WebNavbar() {
  const { lang, setLang, t, p } = useI18n();
  const { user, isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);
  // PC: the profile button's account menu.
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Escape closes the phone menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Escape or a click anywhere else closes the account menu.
  useEffect(() => {
    if (!profileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setProfileOpen(false);
    const onDown = (e: MouseEvent) => {
      if (!profileRef.current?.contains(e.target as Node)) setProfileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [profileOpen]);

  const role = user?.role as Role | undefined;
  const staff = !!role && isStaff(role);
  // Each role sees only its own area: My requests / Jobs / Dashboard.
  const area = role
    ? {
        to: HOME_BY_ROLE[role],
        label: p({ customer: t.nav.myRequests, technician: t.nav.jobs, specialist: t.nav.dashboard, admin: t.nav.admin }[role]),
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
  const accountItem =
    "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-sm font-semibold text-navy transition-colors hover:bg-paper";
  const switchLang = () => setLang(lang === "en" ? "ar" : "en");
  const langButton = (className: string, onClick = switchLang) => (
    <button onClick={onClick} className={className} lang={lang === "en" ? "ar" : "en"}>
      <Globe className="h-4 w-4" aria-hidden />
      {p(t.misc.langName)}
    </button>
  );

  return (
    <>
    {/* Dims the page under the open phone menu; tapping it closes the menu. */}
    {open && (
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-40 bg-navy/40 backdrop-blur-[2px] lg:hidden"
      />
    )}
    <header className="glass fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/" className="flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap">
          <img
            src="/assets/wordmark.png"
            width={600}
            height={222}
            fetchPriority="high"
            alt="Be Right"
            className="h-9 w-auto transition-transform duration-200 hover:-rotate-2"
          />
          <span className="hidden rounded-full bg-navy px-2.5 py-1 font-display text-[10px] font-black uppercase tracking-[0.18em] text-paper xl:block">
            {p(t.brandByline)}
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 whitespace-nowrap lg:flex">
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
              {/* Tablets: the section links are in the menu, so keep these shortcuts here.
                  PC: the language switch is in the nav, the rest in the account menu. */}
              {langButton("hidden min-h-11 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-bold text-navy/70 transition-colors hover:text-flame sm:flex lg:hidden")}
              {area && !staff && (
                <Link
                  to={area.to}
                  className="hidden min-h-11 items-center whitespace-nowrap rounded-full px-3 font-display text-sm font-semibold text-navy hover:bg-white sm:inline-flex lg:hidden"
                >
                  {area.label}
                </Link>
              )}
              <button
                onClick={() => logout()}
                className="hidden min-h-11 whitespace-nowrap rounded-full px-3 text-sm font-semibold text-navy/80 hover:text-navy sm:block lg:hidden"
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
            <Link to="/book" className="header-booking btn-pill-primary !min-h-11 whitespace-nowrap !px-5 !py-2">
              {p(t.nav.book)}
            </Link>
          )}

          {isAuthenticated && (
            <div ref={profileRef} className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setProfileOpen(!profileOpen)}
                aria-label={p(t.nav.account)}
                aria-expanded={profileOpen}
                aria-controls="account-menu"
                className="inline-flex min-h-11 items-center gap-1 rounded-full border-[1.5px] border-navy bg-white ps-1 pe-2.5 text-navy shadow-[0_3px_0_rgb(12_43_92/1)] transition-transform active:translate-y-0.5"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-paper">
                  <UserRound className="h-4 w-4" aria-hidden />
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${profileOpen ? "rotate-180" : ""}`} aria-hidden />
              </button>
              {profileOpen && (
                <div
                  id="account-menu"
                  className="absolute end-0 top-[calc(100%+10px)] w-64 overflow-hidden rounded-2xl border-[1.5px] border-navy/15 bg-white shadow-[0_12px_32px_rgb(12_43_92/0.16)]"
                >
                  <div className="border-b border-navy/10 px-4 py-3">
                    <p className="truncate font-display text-sm font-black text-navy">{user?.name || user?.email}</p>
                    {user?.name && user.email && <p className="truncate text-xs text-navy/60">{user.email}</p>}
                  </div>
                  <div className="flex flex-col p-1.5">
                    {/* Staff already have their area as the main button next to this menu. */}
                    {area && !staff && (
                      <Link to={area.to} onClick={() => setProfileOpen(false)} className={accountItem}>
                        <ClipboardList className="h-4 w-4 text-navy/60" aria-hidden />
                        {area.label}
                      </Link>
                    )}
                    <Link to="/account" onClick={() => setProfileOpen(false)} className={accountItem}>
                      <UserRound className="h-4 w-4 text-navy/60" aria-hidden />
                      {p(t.nav.account)}
                    </Link>
                    <span aria-hidden className="mx-3 my-1 h-px bg-navy/10" />
                    <button type="button" onClick={() => logout()} className={accountItem}>
                      <LogOut className="h-4 w-4 text-navy/60 rtl:-scale-x-100" aria-hidden />
                      {p(t.nav.logout)}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-navy bg-white text-navy shadow-[0_3px_0_rgb(12_43_92/1)] lg:hidden"
            onClick={() => setOpen(!open)}
            aria-label={p(t.nav.menu)}
            aria-expanded={open}
            aria-controls="mobile-navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-navigation"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t-[1.5px] border-navy/15 bg-paper px-4 py-4 shadow-[0_12px_24px_rgb(12_43_92/0.15)] lg:hidden"
        >
          <div className="flex flex-col gap-1">
            {/* Staff already have their area as the main header button. */}
            {area && !staff && (
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
            <Link to="/join" onClick={() => setOpen(false)} className={menuItem}>
              {p(t.nav.join)}
            </Link>
            {isAuthenticated ? (
              <button onClick={() => logout()} className={`${menuItem} text-start`}>
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
            {/* Discreet language switch inside the mobile menu, under a straight divider */}
            <span aria-hidden className="mx-4 my-1 h-px bg-navy/10" />
            {langButton(
              "flex min-h-11 items-center gap-2 rounded-2xl px-4 text-sm font-bold text-navy/70 hover:text-flame",
              () => {
                switchLang();
                setOpen(false);
              },
            )}
          </div>
        </nav>
      )}
    </header>
    </>
  );
}
