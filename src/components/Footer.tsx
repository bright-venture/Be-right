import { Link } from "react-router";
import { useI18n } from "@/i18n";
import { INTRO_REPLAY_EVENT } from "@/lib/intro";

/** `className` sets the bottom padding (default `pb-16`), e.g. extra room above a sticky bar. */
export function Footer({ className = "pb-16" }: { className?: string }) {
  const { t, p } = useI18n();
  const linkGroups = [
    [
      { to: "/#services", label: p(t.nav.services), anchor: true },
      { to: "/#how", label: p(t.nav.how), anchor: true },
      { to: "/#coverage", label: p(t.nav.coverage), anchor: true },
      { to: "/#faq", label: p(t.faq.kicker).replace(/[()]/g, ""), anchor: true },
    ],
    [
      { to: "/guarantee", label: p(t.nav.guarantee), anchor: false },
      { to: "/clients", label: p(t.trustRow.clientsTitle), anchor: false },
      { to: "/join", label: p(t.nav.join), anchor: false },
      { to: "/requests", label: p(t.nav.myRequests), anchor: false },
    ],
  ];
  const linkClass =
    "flex w-fit min-h-10 items-center text-sm font-semibold text-paper/80 transition-colors hover:text-flame-light md:min-h-8";

  return (
    <footer className="tape-navy grain relative text-paper">
      <div className={`relative mx-auto max-w-6xl px-4 pt-16 sm:px-6 ${className}`}>
        {/* Giant slogan (Arabic needs more line height than the Latin display face) */}
        <p className="font-display text-5xl font-black leading-[0.95] tracking-tight rtl:leading-[1.2] sm:text-7xl">
          {p(t.footer.tagline)}
        </p>

        <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-paper/15 pt-10 md:grid-cols-[1.2fr_1fr_1fr] md:gap-10">
          <div className="col-span-2 md:col-span-1">
            <div className="inline-block rounded-2xl bg-white px-4 py-2.5 shadow-[0_5px_0_rgb(244_83_9/0.9)]">
              <img src="/assets/wordmark.png" width={600} height={222} loading="lazy" alt="Be Right" className="h-10 w-auto" />
            </div>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-paper/75">{p(t.footer.contactSoon)}</p>
            <Link to="/book" className="btn-pill-primary mt-6">
              {p(t.nav.book)}
            </Link>
          </div>
          {linkGroups.map((links, gi) => (
            <nav key={gi} className="flex flex-col gap-1 md:gap-2.5">
              {links.map((l) =>
                l.anchor ? (
                  <a key={l.to} href={l.to} className={linkClass}>
                    {l.label}
                  </a>
                ) : (
                  <Link key={l.to} to={l.to} className={linkClass}>
                    {l.label}
                  </Link>
                ),
              )}
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-paper/15 pt-6 text-xs text-paper/75 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <span>{p(t.footer.rights)}</span>
          <nav aria-label={p(t.legal.footerLinks)} className="flex gap-5">
            <Link to="/terms" className="inline-flex min-h-10 items-center underline underline-offset-4 hover:text-flame-light sm:min-h-0">
              {p(t.legal.terms)}
            </Link>
            <Link to="/privacy" className="inline-flex min-h-10 items-center underline underline-offset-4 hover:text-flame-light sm:min-h-0">
              {p(t.legal.privacy)}
            </Link>
          </nav>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(INTRO_REPLAY_EVENT))}
            className="w-fit min-h-10 font-semibold text-paper/75 underline decoration-paper/30 underline-offset-4 transition-colors hover:text-flame-light sm:min-h-8"
          >
            {p(t.footer.replayIntro)}
          </button>
          <span className="font-display uppercase tracking-[0.25em]">{p(t.hero.kicker)}</span>
        </div>
      </div>
    </footer>
  );
}
