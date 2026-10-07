import { Link } from "react-router";
import { ArrowRight, BadgeCheck, ChevronRight, RotateCcw, Search, ShieldCheck, Siren } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ServiceIcon } from "@/components/ServiceIcon";
import { AccountDeletedNotice } from "@/components/AccountDeletedNotice";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import {
  CATEGORY_MAP,
  CATEGORY_TINT,
  MAIN_SERVICES,
  STATUS_ORDER,
  type RequestStatus,
} from "@contracts/services";
import { EMERGENCY_PROBLEMS, bookingHref } from "@contracts/picker";
import { WORKMANSHIP_GUARANTEE_DAYS, arabicDigits } from "@contracts/legal";

const SECTION = "font-display text-lg font-extrabold tracking-tight text-navy";

/** Requests still moving: the home screen follows the newest one. */
const OPEN: readonly RequestStatus[] = ["submitted", "in_review", "quote_ready", "approved", "scheduled", "in_progress"];

function greeting(hour: number) {
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

/** The phone app's home: services first, an emergency shortcut, and the request under way. */
export default function AppHome() {
  const { t, p, lang } = useI18n();
  const { user } = useAuth();
  const isCustomer = user?.role === "customer";
  const mine = trpc.requests.mine.useQuery(undefined, { enabled: isCustomer });
  const current = mine.data?.find((r) => OPEN.includes(r.status as RequestStatus));

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const hello = p(t.app[greeting(new Date().getHours())]);
  const days = lang === "ar" ? arabicDigits(WORKMANSHIP_GUARANTEE_DAYS) : String(WORKMANSHIP_GUARANTEE_DAYS);

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <AccountDeletedNotice />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-7 px-4 pt-20">
        {/* greeting + problem search */}
        <section className="flex flex-col gap-3 pt-2">
          <p className="text-sm font-semibold text-navy/60">
            {hello}
            {firstName ? `, ${firstName}` : ""}
          </p>
          <h1 className="font-display text-[28px] font-black leading-tight tracking-tight text-navy">
            {p(t.app.headline)}
          </h1>
          <Link
            to="/book"
            className="mt-1 flex min-h-14 items-center gap-3 rounded-2xl border border-navy/10 bg-white px-4 text-navy/50 shadow-[0_2px_10px_rgb(12_43_92/0.06)] active:scale-[0.99]"
          >
            <Search className="h-5 w-5 text-navy/60" />
            <span className="flex-1 text-[15px]">{p(t.app.searchPh)}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-flame text-white">
              <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
            </span>
          </Link>
        </section>

        {/* the request under way */}
        {current && (
          <section>
            <Link
              to={`/requests?open=${current.id}`}
              className="block rounded-3xl bg-navy p-5 text-white shadow-[0_10px_24px_rgb(12_43_92/0.25)] active:scale-[0.99]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-white/60">{p(t.app.current)}</span>
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold">
                  {p(t.status[current.status as RequestStatus])}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                  <ServiceIcon id={current.category} className="h-5 w-5 text-flame-light" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-extrabold">
                    {CATEGORY_MAP[current.category] ? p(CATEGORY_MAP[current.category].name) : current.category}
                  </p>
                  <p className="text-xs text-white/60">
                    #{current.id} · {current.preferredDate}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-white/60 rtl:-scale-x-100" />
              </div>
              {/* progress through the request's life */}
              <div className="mt-4 flex gap-1" aria-hidden>
                {STATUS_ORDER.filter((s) => s !== "cancelled").map((s, i) => (
                  <span
                    key={s}
                    className={`h-1.5 flex-1 rounded-full ${
                      i <= STATUS_ORDER.indexOf(current.status as RequestStatus) ? "bg-flame" : "bg-white/15"
                    }`}
                  />
                ))}
              </div>
              {current.status === "quote_ready" && (
                <p className="mt-3 text-sm font-semibold text-flame-light">{p(t.app.quoteReady)}</p>
              )}
            </Link>
          </section>
        )}

        {/* emergency shortcut */}
        <section className="rounded-3xl bg-flame p-5 text-white shadow-[0_10px_24px_rgb(244_83_9/0.28)]">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20">
              <Siren className="h-6 w-6" />
            </span>
            <div>
              <h2 className="font-display text-lg font-black">{p(t.app.emergencyTitle)}</h2>
              <p className="text-sm text-white/90">{p(t.app.emergencySub)}</p>
            </div>
          </div>
          {/* Every problem stays inside the card: the buttons wrap onto as many lines as they need. */}
          <div className="mt-4 flex flex-wrap gap-2">
            {EMERGENCY_PROBLEMS.map((id) => (
              <Link
                key={id}
                to={bookingHref(id, { emergency: true })}
                className="flex min-h-10 items-center rounded-full bg-white px-3.5 text-[13px] font-bold text-navy active:scale-95"
              >
                {p(t.picker.problems[id])}
              </Link>
            ))}
          </div>
        </section>

        {/* services */}
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className={SECTION}>{p(t.app.servicesTitle)}</h2>
            <Link to="/services" className="min-h-10 py-2 text-sm font-bold text-flame-ink">
              {p(t.app.seeAll)}
            </Link>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-x-2 gap-y-4">
            {MAIN_SERVICES.map((id) => {
              const c = CATEGORY_MAP[id];
              if (!c) return null;
              const tint = CATEGORY_TINT[id] ?? { bg: "#ECEFF4", ink: "#0C2B5C" };
              return (
                <Link key={id} to={`/services#${id}`} className="flex flex-col items-center gap-1.5 text-center active:scale-95">
                  <span
                    className="flex h-[60px] w-[60px] items-center justify-center rounded-2xl"
                    style={{ background: tint.bg, color: tint.ink }}
                  >
                    <ServiceIcon id={id} className="h-7 w-7" />
                  </span>
                  <span className="text-[11.5px] font-bold leading-tight text-navy">{p(c.name)}</span>
                </Link>
              );
            })}
          </div>
        </section>

        {/* why Be Right */}
        <section>
          <h2 className={SECTION}>{p(t.app.whyTitle)}</h2>
          <div className="mt-3 overflow-hidden rounded-3xl border border-navy/10 bg-white">
            {[
              { icon: ShieldCheck, title: p(t.app.whyChecked), sub: p(t.app.whyCheckedSub), to: "/checks" },
              { icon: BadgeCheck, title: p(t.app.whyPrice), sub: p(t.app.whyPriceSub), to: "/guarantee" },
              {
                icon: RotateCcw,
                title: p(t.app.whyGuarantee).replace("{days}", days),
                sub: p(t.app.whyGuaranteeSub),
                to: "/guarantee",
              },
            ].map(({ icon: Icon, title, sub, to }, i) => (
              <Link
                key={title}
                to={to}
                className={`flex items-center gap-3 px-4 py-3.5 active:bg-navy/5 ${i ? "border-t border-navy/10" : ""}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy/5 text-navy">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-navy">{title}</span>
                  <span className="block text-xs text-navy/60">{sub}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-navy/35 rtl:-scale-x-100" />
              </Link>
            ))}
          </div>
        </section>

        {/* technicians */}
        <section className="mb-2 flex items-center gap-4 rounded-3xl border border-dashed border-navy/20 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-extrabold text-navy">{p(t.app.joinTitle)}</p>
            <p className="text-xs text-navy/60">{p(t.app.joinSub)}</p>
          </div>
          <Link to="/join" className="btn-pill-outline !min-h-10 shrink-0 !px-4 text-sm">
            {p(t.app.joinCta)}
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
