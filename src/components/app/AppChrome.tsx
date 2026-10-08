import { Link, useLocation, useNavigate } from "react-router";
import {
  ChevronLeft,
  ClipboardList,
  Globe,
  House,
  LayoutDashboard,
  LayoutGrid,
  Plus,
  ShieldCheck,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import type { LocalText } from "@contracts/services";

type Tab = { to: string; label: LocalText; icon: LucideIcon; primary?: boolean };

/** The tab bar's destinations depend on who's signed in: each role sees its own area. */
function useTabs(): Tab[] {
  const { t } = useI18n();
  const { user, isAuthenticated } = useAuth();
  const account: Tab = { to: isAuthenticated ? "/account" : "/login", label: t.app.account, icon: UserRound };
  if (user?.role === "technician") return [{ to: "/tech", label: t.nav.jobs, icon: Wrench }, account];
  if (user?.role === "specialist") return [{ to: "/dashboard", label: t.nav.dashboard, icon: LayoutDashboard }, account];
  // Admins: requests and technicians are tabs inside Admin, so no separate Dashboard.
  if (user?.role === "admin") return [{ to: "/admin", label: t.nav.admin, icon: ShieldCheck }, account];
  return [
    { to: "/", label: t.app.home, icon: House },
    { to: "/services", label: t.app.services, icon: LayoutGrid },
    { to: "/book", label: t.app.book, icon: Plus, primary: true },
    { to: "/requests", label: t.app.requests, icon: ClipboardList },
    account,
  ];
}

const isActive = (pathname: string, to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

/** App top bar: the logo on main screens, a back button everywhere else, and the language switch. */
export function AppTopBar() {
  const { lang, setLang, t, p } = useI18n();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tabs = useTabs();
  // Main screens show the logo; anything deeper (a request, a page) gets a back button.
  const isRoot =
    tabs.some((tab) => pathname === tab.to) || ["/", "/login", "/signup"].includes(pathname);

  return (
    // pt: the status bar's height (0 on the web and where the system already makes room).
    <header className="fixed inset-x-0 top-0 z-50 border-b border-navy/10 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-between gap-3 px-4">
        {isRoot ? (
          <Link to="/" className="flex min-h-11 items-center" aria-label="Be Right">
            <img src="/assets/wordmark.png" width={600} height={222} alt="Be Right" className="h-8 w-auto" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
            className="-ms-2 flex min-h-11 items-center gap-1 rounded-full pe-3 ps-2 font-display text-sm font-bold text-navy active:bg-navy/5"
          >
            <ChevronLeft className="h-5 w-5 rtl:-scale-x-100" />
            {p(t.app.back)}
          </button>
        )}
        <button
          type="button"
          onClick={() => setLang(lang === "en" ? "ar" : "en")}
          lang={lang === "en" ? "ar" : "en"}
          className="flex min-h-11 items-center gap-1.5 rounded-full border border-navy/15 px-3.5 text-sm font-bold text-navy active:bg-navy/5"
        >
          <Globe className="h-4 w-4" aria-hidden />
          {p(t.misc.langName)}
        </button>
      </div>
    </header>
  );
}

/** App tab bar, fixed at the bottom; the page keeps room for it. Takes the Footer's place. */
export function AppTabBar() {
  const { p } = useI18n();
  const { pathname } = useLocation();
  const tabs = useTabs();

  return (
    <>
      <div aria-hidden className="h-24" />
      <nav
        aria-label="Be Right"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-navy/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      >
        <ul className="mx-auto flex h-[68px] max-w-lg items-stretch justify-around px-2">
          {tabs.map((tab) => {
            const active = isActive(pathname, tab.to);
            const Icon = tab.icon;
            return (
              <li key={tab.to} className="flex flex-1 justify-center">
                <Link
                  to={tab.to}
                  aria-current={active ? "page" : undefined}
                  className="flex w-full flex-col items-center justify-center gap-1 text-[11px] font-bold"
                >
                  {tab.primary ? (
                    <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-flame text-white shadow-[0_6px_16px_rgb(244_83_9/0.35)]">
                      <Icon className="h-6 w-6" strokeWidth={2.5} />
                    </span>
                  ) : (
                    <span
                      className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                        active ? "bg-flame/10 text-flame" : "text-navy/55"
                      }`}
                    >
                      <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} />
                    </span>
                  )}
                  <span className={active || tab.primary ? "text-navy" : "text-navy/55"}>{p(tab.label)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
