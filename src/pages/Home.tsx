import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  ChevronDown,
  ClipboardCheck,
  MapPin,
  PiggyBank,
  ReceiptText,
  ShieldCheck,
  Store,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { HeroBird } from "@/components/HeroBird";
import { ClientCarousel } from "@/components/ClientCarousel";
import { CategoryPicker } from "@/components/CategoryPicker";
import { EmergencyChoice } from "@/components/EmergencyChoice";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import {
  CATEGORY_MAP,
  CATEGORY_TINT,
  COVERAGE_NOTE,
  FACILITY_GROUP,
  FACILITY_SERVICES,
  TRADE_SERVICES,
} from "@contracts/services";
import { INTRO_DONE_EVENT } from "@/lib/intro";
import { AccountDeletedNotice } from "@/components/AccountDeletedNotice";


export default function Home() {
  const { t, p, lang } = useI18n();
  const isAr = lang === "ar";

  /* Launch choreography: the bird runs across first, then this flag starts
     the staggered content reveal. A Skip on the intro cuts straight to
     revealed content. Safety fallback can never strand content. */
  const [heroReady, setHeroReady] = useState(false);
  useEffect(() => {
    const cut = () => setHeroReady(true);
    window.addEventListener(INTRO_DONE_EVENT, cut);
    const t = setTimeout(() => setHeroReady(true), 9000);
    return () => {
      window.removeEventListener(INTRO_DONE_EVENT, cut);
      clearTimeout(t);
    };
  }, []);

  /* Pause looping hero motion when the hero scrolls offscreen */
  const heroRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = heroRef.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      ([entry]) => el.classList.toggle("hero-motion-paused", !entry.isIntersecting),
      { threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* Phones: the sticky booking bar appears once the whole hero (category picker included)
     has scrolled away under the header, so it never covers the hero's own buttons. */
  const [showBar, setShowBar] = useState(false);
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || !("IntersectionObserver" in window)) return setShowBar(true);
    const io = new IntersectionObserver(
      ([entry]) => setShowBar(!entry.isIntersecting && entry.boundingClientRect.bottom <= 64),
      { rootMargin: "-64px 0px 0px 0px" },
    );
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  const trades = TRADE_SERVICES.map((id) => CATEGORY_MAP[id]).filter(Boolean);
  const facility = FACILITY_SERVICES.map((id) => CATEGORY_MAP[id]).filter(Boolean);

  const renderTile = (c: (typeof trades)[number], i: number) => {
    const tint = CATEGORY_TINT[c.id] ?? { bg: "#ECEFF4", ink: "#0C2B5C" };
    return (
      <Link
        key={c.id}
        to={`/book?cat=${c.id}`}
        className="service-tile group relative flex h-full min-h-[168px] flex-col items-center justify-center gap-2.5 rounded-[26px] border-[1.5px] border-navy/12 bg-white px-2 py-5 text-center shadow-[0_3px_0_rgb(12_43_92/0.1)] transition-all duration-200 hover:-translate-y-1.5 hover:border-navy hover:shadow-[0_7px_0_rgb(12_43_92/0.9)] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-flame active:translate-y-0 active:shadow-[0_2px_0_rgb(12_43_92/0.9)]"
      >
        <span className="ghost-num absolute end-3 top-2 text-xl">
          {String(i + 1).padStart(2, "0")}
        </span>
        <span
          className="flex h-13 w-13 items-center justify-center rounded-2xl p-3 transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6"
          style={{ background: tint.bg, color: tint.ink }}
        >
          <ServiceIcon id={c.id} className="h-6 w-6" />
        </span>
        <span className="text-[12.5px] font-black leading-tight text-navy">{p(c.name)}</span>
      </Link>
    );
  };

  const pricingCards = [
    { icon: ReceiptText, title: t.pricing.feeTitle, body: t.pricing.feeBody },
    { icon: PiggyBank, title: t.pricing.partsTitle, body: t.pricing.partsBody },
    { icon: ClipboardCheck, title: t.pricing.approveTitle, body: t.pricing.approveBody },
  ];

  return (
    <div className={`home-page min-h-screen overflow-x-clip bg-paper ${heroReady ? "hero-ready" : ""}`}>
      <Navbar />
      <AccountDeletedNotice />

      {/* ============ HERO — editorial poster ============ */}
      <section ref={heroRef} className="home-hero relative overflow-hidden pt-16">
        <div className="hero-inner relative mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
          <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="relative z-10 min-w-0">
              <h1
                className={`hero-enter font-display font-black leading-[1.02] tracking-tight text-navy ${
                  isAr
                    ? "text-[38px] sm:text-[52px] lg:text-[64px]"
                    : "text-[42px] sm:text-[58px] lg:text-[70px]"
                }`}
              >
                {p(t.hero.kicker)}
              </h1>
              {/* Phones: the bird and its speech bubble sit beside the title and the promise;
                  the paragraph wraps alongside. Larger screens: the group is invisible to layout. */}
              <div className="hero-heading-group">
                <div className="hero-title-bird sm:hidden">
                  <div className="hero-title-speech hero-enter hero-d2">{p(t.footer.tagline)}</div>
                  <HeroBird className="w-full" onSettled={() => setHeroReady(true)} />
                </div>
                <div className="hero-title-copy">
                  <p
                    className={`hero-subtitle mt-5 font-display font-black leading-[1.12] tracking-tight text-navy ${
                      isAr ? "text-[24px] sm:text-[30px] lg:text-[34px]" : "text-[26px] sm:text-[32px] lg:text-[38px]"
                    }`}
                  >
                    <span className="reveal-line">
                      <span>{p(t.hero.h1a)}</span>
                    </span>
                    <span className="reveal-line">
                      <span>{p(t.hero.h1b)}</span>
                    </span>
                  </p>
                  <p className="hero-promise hero-enter hero-d2 mt-4 font-display text-lg font-black uppercase tracking-[0.14em] text-flame-ink sm:text-xl">
                    {p(t.hero.promise)}
                  </p>
                </div>
              </div>
              <p className="hero-description hero-enter hero-d3 mt-4 max-w-xl text-[15px] leading-relaxed text-navy/70 sm:text-base">
                {p(t.hero.sub)}
              </p>
              {/* The two ways in: an emergency (call the team) or a normal booking online. */}
              <EmergencyChoice bookHref="/book" className="hero-actions hero-enter hero-d4 mt-7 max-w-xl" />
              <ul className="hero-benefits hero-enter hero-d5 mt-6 flex flex-wrap gap-x-5 gap-y-2">
                {[t.hero.chip1, t.hero.chip2, t.hero.chip3, t.hero.chip4].map((c, i) => (
                  <li
                    key={i}
                    className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-navy/70 bg-white px-3.5 py-1.5 text-xs font-black text-navy shadow-[0_2px_0_rgb(12_43_92/0.25)]"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-flame" />
                    {p(c)}
                  </li>
                ))}
              </ul>
            </div>

            {/* The mascot, with its speech bubble. */}
            <div className="relative mx-auto hidden w-full max-w-[420px] pt-20 sm:block">
              <div className="hero-enter hero-d1 absolute top-0 end-0 z-20 max-w-full">
                <div className="relative rounded-2xl border-2 border-navy bg-white px-6 py-4 shadow-[0_4px_0_rgb(12_43_92/0.2)]">
                  <span className="font-display text-2xl font-black text-navy">{p(t.footer.tagline)}</span>
                  <span aria-hidden className="absolute -bottom-[9px] start-12 h-4 w-4 rotate-45 border-b-2 border-e-2 border-navy bg-white" />
                </div>
              </div>
              <div className="relative flex items-end justify-center">
                {/* A soft round backdrop behind the bird. */}
                <span aria-hidden className="pointer-events-none absolute inset-x-[6%] bottom-[4%] top-[10%] rounded-full bg-[#E2EBF7]" />
                <HeroBird className="relative z-10 w-[85%]" onSettled={() => setHeroReady(true)} />
              </div>
              <div className="relative z-20 mx-auto -mt-5 flex w-fit items-center gap-2 rounded-full border border-navy/15 bg-white px-4 py-2">
                <BadgeCheck className="h-5 w-5 text-flame" />
                <span className="font-display text-xs font-black text-navy">{p(t.hero.chip4)}</span>
              </div>
            </div>
          </div>

          {/* Category picker — Checkatrade-style pill row + guided modal */}
          <CategoryPicker />
        </div>
      </section>

      {/* ============ CLIENTS — one brand per slide ============ */}
      <section id="clients" className="border-t-[1.5px] border-navy/10 py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="tech-label text-navy/70">{p(t.clients.kicker)}</span>
              <h2 className="mt-4 font-display text-3xl font-black tracking-tight text-navy sm:text-4xl">
                {p(t.clients.title)}
              </h2>
            </div>
            <p className="max-w-sm text-[13px] leading-relaxed text-navy/70">{p(t.clients.sub)}</p>
          </div>
          <ClientCarousel />
        </div>
      </section>

      {/* ============ SERVICES — grouped index ============ */}
      <section id="services" className="scroll-mt-20 border-b-[1.5px] border-navy/10 py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="tech-label text-navy/70">{p(t.services.kicker)}</span>
              <h2 className="mt-4 font-display text-3xl font-black tracking-tight text-navy sm:text-4xl">
                {p(t.services.title)}
              </h2>
            </div>
            <p className="max-w-sm text-[13px] leading-relaxed text-navy/70">{p(t.services.sub)}</p>
          </div>

          {/* The ten trades: two full rows of five (five rows of two on phones). */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-5">
            {trades.map((c, i) => renderTile(c, i))}
          </div>

          {/* Facility Services: the six services for running a place, as one group
              (one row of six on computers, two of three on tablets, three of two on phones). */}
          <div className="mt-4 rounded-[30px] border-[1.5px] border-navy/12 bg-[#F1F5FB] p-3 sm:mt-5 sm:p-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-4 pt-1">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy text-white">
                <Building2 className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-lg font-black text-navy sm:text-xl">{p(FACILITY_GROUP.name)}</h3>
                <p className="text-[13px] leading-snug text-navy/70">{p(FACILITY_GROUP.blurb)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
              {facility.map((c, i) => renderTile(c, trades.length + i))}
            </div>
          </div>

          <div className="mt-4 grid sm:mt-5">
              <Link
                to="/book"
                className="group col-span-full flex min-h-16 items-center justify-center gap-3 rounded-[26px] px-5 py-4 text-white transition-all duration-200 hover:-translate-y-1 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-navy active:translate-y-0"
                style={{
                  background: "#F45309",
                  boxShadow: "0 6px 18px rgb(244 83 9 / 0.18)",
                }}
              >
                <span className="font-display text-base font-black">{p(t.cta.title)}</span>
                <span className="inline-flex items-center gap-1 text-sm font-bold underline underline-offset-2">
                  {p(t.services.bookThis)}
                  <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                </span>
              </Link>
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS — 3 steps ============ */}
      <section id="how" className="tape-navy grain relative scroll-mt-20 py-16 text-paper">
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <span className="tech-label text-flame-light">{p(t.how.kicker)}</span>
          <h2 className="mt-4 font-display text-3xl font-black tracking-tight sm:text-4xl">
            {p(t.how.title)}
          </h2>

          <ol className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            {t.how.steps.map((s, i) => (
              <li
                key={i}
                className="relative rounded-3xl border-[1.5px] border-paper/20 bg-paper/[0.06] p-6 pt-9 backdrop-blur-sm"
              >
                <span className="absolute -top-4 start-5 rounded-full bg-flame px-3.5 py-1.5 font-display text-sm font-black text-white shadow-[0_3px_0_rgb(8_30_66/0.8)]">
                  {i + 1}
                </span>
                <h3 className="font-display text-lg font-black">{p(s.title)}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-paper/80">{p(s.body)}</p>
                {i < 2 && (
                  <ArrowRight
                    aria-hidden
                    className="absolute -end-3.5 top-1/2 hidden h-7 w-7 -translate-y-1/2 text-flame rtl:-scale-x-100 md:block"
                  />
                )}
              </li>
            ))}
          </ol>

          <details className="group mt-8 rounded-3xl border-[1.5px] border-paper/20 bg-paper/[0.04]">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 font-display text-sm font-black uppercase tracking-[0.15em] text-paper/90 [&::-webkit-details-marker]:hidden">
              {p(t.how.moreTitle)}
              <ChevronDown className="h-5 w-5 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="grid gap-4 px-6 pb-6 pt-2 sm:grid-cols-2">
              {t.how.moreItems.map((m, i) => (
                <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-paper/75">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-flame" />
                  {p(m)}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </section>

      {/* ============ COVERAGE ============ */}
      <section id="coverage" className="scroll-mt-20 border-b-[1.5px] border-navy/10 py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="tech-label text-navy/70">{p(t.coverage.kicker)}</span>
              <h2 className="mt-4 font-display text-3xl font-black tracking-tight text-navy sm:text-4xl">
                {p(t.coverage.title)}
              </h2>
            </div>
            <p className="max-w-sm text-[13px] leading-relaxed text-navy/70">{p(COVERAGE_NOTE)}</p>
          </div>
          {/* How it works wherever you are: three equal cards. */}
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {t.coverage.steps.map((step, i) => (
              <li key={i} className="card-br flex flex-col p-6">
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-navy font-display text-sm font-black text-paper"
                  style={{ boxShadow: "0 2px 0 rgb(244 83 9 / 0.9)" }}
                >
                  {i === 0 ? <MapPin className="h-4 w-4" /> : i + 1}
                </span>
                <h3 className="mt-4 font-display text-lg font-black text-navy">{p(step.title)}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-navy/70">{p(step.body)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ============ PRICING & GUARANTEE ============ */}
      <section id="pricing" className="scroll-mt-20 py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="tech-label text-navy/70">{p(t.pricing.kicker)}</span>
              <h2 className="mt-4 font-display text-3xl font-black tracking-tight text-navy sm:text-4xl">
                {p(t.pricing.title)}
              </h2>
            </div>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {pricingCards.map((c, i) => (
              <div key={i} className="card-br card-hover p-6">
                <span
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-paper"
                  style={{ boxShadow: "0 3px 0 rgb(244 83 9 / 0.9)" }}
                >
                  <c.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-black text-navy">{p(c.title)}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-navy/70">{p(c.body)}</p>
              </div>
            ))}
          </div>
          {/* Guarantee card */}
          <div className="tape-navy grain relative mt-4 overflow-hidden rounded-[28px] p-7 text-paper sm:p-8">
            <div className="relative flex flex-wrap items-center gap-6">
              <span
                className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-flame text-white"
                style={{ boxShadow: "0 4px 0 rgb(8 30 66 / 0.9)" }}
              >
                <ShieldCheck className="h-7 w-7" />
              </span>
              <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                <h3 className="font-display text-xl font-black">{p(t.pricing.guaranteeTitle)}</h3>
                <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-paper/80">
                  {p(t.pricing.guaranteeBody)}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-paper/55">
                  {p(t.pricing.guaranteeExclusions)}
                </p>
              </div>
              <Link
                to="/guarantee"
                className="btn-pill-white shrink-0 !min-h-11 !px-5 !py-2 text-sm"
              >
                {p(t.nav.guarantee)}
                <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============ TRUST — three-column row (checks / clients / guarantee) ============ */}
      <section id="trust" className="scroll-mt-20 py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b-[1.5px] border-navy/15 pb-6">
            <div>
              <span className="tech-label text-navy/70">{p(t.trust.kicker)}</span>
              <h2 className="mt-4 font-display text-3xl font-black tracking-tight text-navy sm:text-4xl">
                {p(t.trust.title)}
              </h2>
            </div>
          </div>
          <div className="grid gap-4 pt-8 md:grid-cols-3">
            <div className="card-br card-hover flex flex-col p-6">
              <span
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-paper"
                style={{ boxShadow: "0 3px 0 rgb(244 83 9 / 0.9)" }}
              >
                <ClipboardCheck className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-black text-navy">
                {p(t.trustRow.checksTitle)}
              </h3>
              <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-navy/70">
                {p(t.trustRow.checksBody)}
              </p>
              <Link
                to="/checks"
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-black text-flame-ink underline-offset-4 hover:underline"
              >
                {p(t.trustRow.checksCta)}
                {/* "Learn more" twice on one page: say what about, for screen readers and search engines. */}
                <span className="sr-only">: {p(t.trustRow.checksTitle)}</span>
                <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
              </Link>
            </div>
            <div className="card-br card-hover flex flex-col p-6">
              <span
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-paper"
                style={{ boxShadow: "0 3px 0 rgb(244 83 9 / 0.9)" }}
              >
                <Store className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-black text-navy">
                {p(t.trustRow.clientsTitle)}
              </h3>
              <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-navy/70">
                {p(t.trustRow.clientsBody)}
              </p>
              <Link
                to="/clients"
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-black text-flame-ink underline-offset-4 hover:underline"
              >
                {p(t.trustRow.clientsCta)}
                <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
              </Link>
            </div>
            <div className="card-br card-hover flex flex-col p-6">
              <span
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-paper"
                style={{ boxShadow: "0 3px 0 rgb(244 83 9 / 0.9)" }}
              >
                <ShieldCheck className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-black text-navy">
                {p(t.trustRow.guaranteeTitle)}
              </h3>
              <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-navy/70">
                {p(t.trustRow.guaranteeBody)}
              </p>
              <Link
                to="/guarantee"
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-black text-flame-ink underline-offset-4 hover:underline"
              >
                {p(t.trustRow.guaranteeCta)}
                <span className="sr-only">: {p(t.trustRow.guaranteeTitle)}</span>
                <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section id="faq" className="scroll-mt-20 border-t-[1.5px] border-navy/10 py-14">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <span className="tech-label text-navy/70">{p(t.faq.kicker)}</span>
          <h2 className="mt-4 font-display text-3xl font-black tracking-tight text-navy sm:text-4xl">
            {p(t.faq.title)}
          </h2>
          <div className="mt-8 flex flex-col gap-3">
            {t.faq.items.map((item, i) => (
              <details key={i} className="group card-br overflow-hidden">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 p-5 font-display text-base font-black text-navy [&::-webkit-details-marker]:hidden">
                  {p(item.q)}
                  <ChevronDown className="h-5 w-5 shrink-0 text-flame transition-transform group-open:rotate-180" />
                </summary>
                <p className="border-t border-navy/10 px-5 pb-5 pt-4 text-sm leading-relaxed text-navy/75">
                  {p(item.a)}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ============ JOIN — bird-blue band ============ */}
      <section
        id="join"
        className="grain relative py-14 text-white"
        style={{
          background:
            "repeating-linear-gradient(-45deg, transparent 0 14px, rgb(255 255 255 / 0.05) 14px 28px), linear-gradient(135deg, #0B63CE 0%, #0C2B5C 100%)",
        }}
      >
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-8 px-4 sm:px-6">
          <div className="max-w-xl">
            <span className="tech-label text-white">{p(t.join.kicker)}</span>
            <h2 className="mt-3 font-display text-3xl font-black tracking-tight sm:text-4xl">
              {p(t.join.sectionTitle)}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/85">{p(t.join.bullet1)}</p>
          </div>
          <Link to="/join" className="btn-pill-white text-base">
            {p(t.join.cta)}
            <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
          </Link>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section
        className="grain relative overflow-hidden py-20 text-white"
        style={{
          background:
            "repeating-linear-gradient(-45deg, transparent 0 16px, rgb(255 255 255 / 0.05) 16px 32px), #F45309",
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-10 start-0 select-none font-display text-[150px] font-black leading-none text-white/10 sm:text-[220px]"
        >
          GO!
        </span>
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 text-center sm:px-6">
          <img
            src="/assets/mascot-320.webp"
            width={320}
            height={408}
            loading="lazy"
            alt=""
            aria-hidden
            className="h-auto w-24 drop-shadow-[0_14px_20px_rgba(8,30,66,0.4)]"
          />
          <div>
            <h2 className="font-display text-4xl font-black tracking-tight sm:text-5xl">
              {p(t.cta.title)}
            </h2>
            <p className="mt-3 text-base text-white">{p(t.cta.sub)}</p>
          </div>
          <Link
            to="/book"
            className="btn-pill bg-white !text-flame-ink shadow-[0_6px_0_#081E42] hover:-translate-y-0.5 hover:shadow-[0_8px_0_#081E42] active:translate-y-1 active:shadow-[0_2px_0_#081E42]"
          >
            {p(t.cta.button)}
            <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
          </Link>
        </div>
      </section>

      {/* Extra room at the bottom on phones so the booking bar never covers the footer. */}
      <Footer className="pb-28 sm:pb-16" />

      {/* Sticky mobile booking bar */}
      <div
        inert={!showBar}
        className={`mobile-booking-bar fixed inset-x-0 bottom-0 z-40 border-t-[1.5px] border-navy/15 bg-paper/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md transition-transform duration-300 sm:hidden ${
          showBar ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <Link to="/book" className="btn-pill-primary w-full !min-h-12 text-base">
          {p(t.nav.book)}
          <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
        </Link>
      </div>
    </div>
  );
}
