import { Link } from "react-router";
import {
  ArrowRight,
  Zap,
  PiggyBank,
  ShieldCheck,
  BadgeCheck,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Marquee } from "@/components/Marquee";
import { ServiceIcon } from "@/components/ServiceIcon";
import { AccountDeletedNotice } from "@/components/AccountDeletedNotice";
import { useI18n } from "@/i18n";
import {
  CATEGORIES,
  URGENCY_META,
  type UrgencyLevel,
} from "@contracts/services";

const URGENCY_COLORS: Record<UrgencyLevel, string> = {
  normal: "border-navy bg-white text-navy",
  priority: "border-bird bg-bird text-white",
  urgent: "border-flame bg-flame text-white",
  critical: "border-navy-deep bg-navy-deep text-white",
};

export default function Home() {
  const { t, p, lang } = useI18n();
  const isAr = lang === "ar";

  return (
    <div className="min-h-screen bg-paper">
      <Navbar />
      <AccountDeletedNotice />

      <main>
        {/* ============ HERO ============ */}
        <section className="relative overflow-hidden pt-16">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:pt-16">
            <div>
              <span className="tech-label text-flame-ink">
                {p(t.hero.kicker)}
              </span>
              <h1
                className={`mt-6 font-display font-black leading-[1.04] tracking-tight text-navy ${
                  isAr
                    ? "text-[42px] sm:text-[64px] lg:text-[76px]"
                    : "text-[46px] sm:text-[72px] lg:text-[88px]"
                }`}
              >
                <span className="reveal-line">
                  <span>{p(t.hero.h1a)}</span>
                </span>
                <span className="reveal-line">
                  <span className="text-flame">{p(t.hero.h1b)}</span>
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-navy/80">
                {p(t.hero.sub)}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/book" className="btn-pill-primary text-base">
                  {p(t.hero.cta)}
                  <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
                </Link>
                <a href="#how" className="btn-pill-outline text-base">
                  {p(t.hero.ctaSecondary)}
                </a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-2.5">
                {[t.hero.chip1, t.hero.chip2, t.hero.chip3].map((c, i) => (
                  <li
                    key={i}
                    className="inline-flex items-center gap-2 rounded-full border-2 border-navy bg-white px-4 py-2 text-sm font-bold text-navy"
                  >
                    <span className="h-2 w-2 rounded-full bg-flame" />
                    {p(c)}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
              <div className="absolute inset-x-8 bottom-4 top-16 rounded-[48px] border-2 border-navy bg-white" />
              <img
                src="/assets/mascot-480.webp"
                srcSet="/assets/mascot-480.webp 480w, /assets/mascot-946.webp 946w"
                sizes="(min-width: 1024px) 448px, 384px"
                width={946}
                height={1207}
                fetchPriority="high"
                alt="Be Right bird mascot in a hard hat and safety vest"
                className="relative z-10 mx-auto h-auto w-full max-w-md animate-floaty"
              />
            </div>
          </div>
        </section>

        <Marquee />

        {/* ============ SERVICES ============ */}
        <section id="services" className="scroll-mt-20 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <span className="tech-label text-navy/70">
              {p(t.services.kicker)}
            </span>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <h2 className="max-w-xl font-display text-4xl font-black tracking-tight text-navy sm:text-5xl">
                {p(t.services.title)}
              </h2>
              <p className="max-w-md text-sm leading-relaxed text-navy/70">
                {p(t.services.sub)}
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {CATEGORIES.map((c, i) => (
                <Link
                  key={c.id}
                  to={`/book?cat=${c.id}`}
                  className={`card-br group flex min-h-44 flex-col justify-between p-5 transition-all duration-200 hover:-translate-y-1 hover:bg-navy hover:text-paper ${
                    // playful stagger on wide screens
                    i % 4 === 1 || i % 4 === 3 ? "xl:translate-y-4" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-bird transition-colors group-hover:text-flame">
                      <ServiceIcon id={c.id} className="h-9 w-9" />
                    </span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-current opacity-0 transition-opacity group-hover:opacity-100">
                      <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                    </span>
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-extrabold">
                      {p(c.name)}
                    </h3>
                    <p className="mt-1 text-[13px] leading-snug opacity-70">
                      {p(c.blurb)}
                    </p>
                  </div>
                </Link>
              ))}

              {/* CTA tile completes the grid */}
              <Link
                to="/book"
                className="card-br group flex min-h-44 flex-col justify-between border-flame bg-flame p-5 text-white transition-all duration-200 hover:-translate-y-1 hover:bg-flame-dark xl:translate-y-4"
              >
                <span className="font-display text-[11px] font-bold uppercase tracking-[0.2em]">
                  Be Right
                </span>
                <div>
                  <h3 className="font-display text-xl font-extrabold">
                    {p(t.cta.title)}
                  </h3>
                  <span className="mt-2 inline-flex items-center gap-2 font-bold underline underline-offset-4">
                    {p(t.services.bookThis)}
                    <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                  </span>
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* ============ HOW IT WORKS (dark) ============ */}
        <section
          id="how"
          className="scroll-mt-20 border-y-2 border-navy bg-navy py-16 text-paper sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <span className="tech-label text-flame-light">
              {p(t.how.kicker)}
            </span>
            <h2 className="mt-4 max-w-2xl font-display text-4xl font-black tracking-tight sm:text-5xl">
              {p(t.how.title)}
            </h2>

            <ol className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-3xl border-2 border-paper/25 bg-paper/20 sm:grid-cols-2 lg:grid-cols-3">
              {t.how.steps.map((s, i) => (
                <li
                  key={i}
                  className="flex min-h-48 flex-col justify-between bg-navy p-6"
                >
                  <span className="font-display text-5xl font-black text-flame-light">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="mt-6">
                    <h3 className="font-display text-lg font-extrabold">
                      {p(s.title)}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-paper/70">
                      {p(s.body)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ============ WHY / URGENCY ============ */}
        <section id="why" className="scroll-mt-20 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <span className="tech-label text-navy/70">{p(t.why.kicker)}</span>
            <div className="mt-4 grid gap-10 lg:grid-cols-2">
              <div>
                <h2 className="font-display text-4xl font-black tracking-tight text-navy sm:text-5xl">
                  {p(t.why.title)}
                </h2>
                <p className="mt-5 max-w-lg text-lg leading-relaxed text-navy/80">
                  {p(t.why.sub)}
                </p>
              </div>

              <div className="card-br p-6 sm:p-8">
                <h3 className="font-display text-xl font-extrabold text-navy">
                  {p(t.why.urgencyTitle)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-navy/70">
                  {p(t.why.urgencySub)}
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  {(Object.keys(URGENCY_META) as UrgencyLevel[]).map(level => (
                    <div
                      key={level}
                      className={`flex items-center justify-between gap-4 rounded-2xl border-2 px-5 py-3 ${URGENCY_COLORS[level]}`}
                    >
                      <span className="font-display font-extrabold">
                        {p(URGENCY_META[level].label)}
                      </span>
                      <span className="text-end text-xs leading-snug">
                        {p(URGENCY_META[level].note)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ PROMISE (speed / price / safety / guarantee) ============ */}
        <section
          id="trust"
          className="scroll-mt-20 border-t-2 border-navy/10 py-16 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <span className="tech-label text-navy/70">{p(t.trust.kicker)}</span>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <h2 className="max-w-xl font-display text-4xl font-black tracking-tight text-navy sm:text-5xl">
                {p(t.trust.title)}
              </h2>
              <p className="max-w-md text-sm leading-relaxed text-navy/70">
                {p(t.trust.sub)}
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {t.trust.items.map((item, i) => {
                const Icon = [Zap, PiggyBank, ShieldCheck, BadgeCheck][i];
                return (
                  <div
                    key={i}
                    className={`card-br group p-6 transition-all duration-200 hover:-translate-y-1 ${
                      i === 3 ? "border-flame bg-navy text-paper" : ""
                    }`}
                  >
                    <span
                      className={`inline-flex h-12 w-12 items-center justify-center rounded-full border-2 ${
                        i === 3
                          ? "border-flame bg-flame text-white"
                          : "border-flame text-flame-ink"
                      }`}
                    >
                      <Icon className="h-6 w-6" />
                    </span>
                    <h3
                      className={`mt-4 font-display text-lg font-extrabold ${
                        i === 3 ? "text-white" : "text-navy"
                      }`}
                    >
                      {p(item.title)}
                    </h3>
                    <p
                      className={`mt-2 text-sm leading-relaxed ${
                        i === 3 ? "text-paper/80" : "text-navy/70"
                      }`}
                    >
                      {p(item.body)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ============ JOIN (technicians) ============ */}
        <section
          id="join"
          className="border-t-2 border-navy bg-bird py-16 text-white sm:py-24"
        >
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <span className="tech-label text-white">{p(t.join.kicker)}</span>
              <h2 className="mt-4 font-display text-4xl font-black tracking-tight sm:text-5xl">
                {p(t.join.sectionTitle)}
              </h2>
              <Link to="/join" className="btn-pill-white mt-8 text-base">
                {p(t.join.cta)}
                <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
              </Link>
            </div>
            <ul className="flex flex-col gap-3">
              {[t.join.bullet1, t.join.bullet2, t.join.bullet3].map((b, i) => (
                <li
                  key={i}
                  className="flex items-start gap-4 rounded-2xl border-2 border-white/40 bg-white/10 p-5 text-sm font-medium leading-relaxed"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-flame bg-flame font-display text-sm font-black">
                    {i + 1}
                  </span>
                  {p(b)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ============ CTA (orange flip) ============ */}
        <section className="border-y-2 border-navy bg-flame py-16 text-white sm:py-20">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 text-center sm:px-6">
            <img
              src="/assets/mascot-320.webp"
              width={320}
              height={408}
              loading="lazy"
              alt=""
              aria-hidden
              className="h-auto w-40 drop-shadow-[0_8px_0_rgba(12,43,92,0.25)]"
            />
            <h2 className="font-display text-4xl font-black tracking-tight sm:text-6xl">
              {p(t.cta.title)}
            </h2>
            <p className="max-w-lg text-lg text-white">{p(t.cta.sub)}</p>
            <Link
              to="/book"
              className="btn-pill border-white bg-white !text-flame hover:bg-navy hover:border-navy hover:!text-white text-lg"
            >
              {p(t.cta.button)}
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
