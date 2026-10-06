import { Link } from "react-router";
import { useI18n } from "@/i18n";
import { INTRO_REPLAY_EVENT } from "@/lib/intro";

export function Footer() {
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
  const linkClass = "w-fit min-h-8 text-sm font-semibold text-paper/80 transition-colors hover:text-flame-light";

  return (
    <footer className="tape-navy grain relative text-paper">
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6">
        {/* Giant slogan */}
        <p className="font-display text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl">
          {p(t.footer.tagline)}
        </p>

        <div className="mt-12 grid gap-10 border-t border-paper/15 pt-10 md:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <div className="inline-block rounded-2xl bg-white px-4 py-2.5 shadow-[0_5px_0_rgb(244_83_10/0.9)]">
              <img src="/assets/wordmark.png" width={600} height={222} loading="lazy" alt="Be Right" className="h-10 w-auto" />
            </div>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-paper/75">{p(t.footer.contactSoon)}</p>
            <Link to="/book" className="btn-pill-primary mt-6">
              {p(t.nav.book)}
            </Link>
          </div>
          {linkGroups.map((links, gi) => (
            <nav key={gi} className="flex flex-col gap-2.5">
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
          <nav aria-label={p(t.legal.footerLinks)} className="flex gap-4">
            <Link to="/terms" className="underline underline-offset-4 hover:text-flame-light">
              {p(t.legal.terms)}
            </Link>
            <Link to="/privacy" className="underline underline-offset-4 hover:text-flame-light">
              {p(t.legal.privacy)}
            </Link>
          </nav>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(INTRO_REPLAY_EVENT))}
            className="w-fit min-h-8 font-semibold text-paper/75 underline decoration-paper/30 underline-offset-4 transition-colors hover:text-flame-light"
          >
            {p(t.footer.replayIntro)}
          </button>
          <span className="font-display uppercase tracking-[0.25em]">{p(t.hero.kicker)}</span>
        </div>
      </div>
    </footer>
  );
}
