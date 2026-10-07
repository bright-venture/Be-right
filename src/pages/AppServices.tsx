import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import { CATEGORY_MAP, CATEGORY_TINT, OTHER_SERVICES } from "@contracts/services";
import { CATEGORY_PROBLEMS, ROW_CATS, bookingHref } from "@contracts/picker";

/**
 * The phone app's service list: each trade opens to its common problems, and each
 * problem opens the booking form already filled in.
 */
export default function AppServices() {
  const { t, p } = useI18n();
  const { hash } = useLocation();
  // Arriving from a home-screen tile (/services#plumbing) opens that trade.
  const [open, setOpen] = useState<string | null>(hash.slice(1) || null);
  const [seenHash, setSeenHash] = useState(hash);
  if (hash !== seenHash) {
    setSeenHash(hash);
    setOpen(hash.slice(1) || null);
  }
  // …and brings it into view.
  useEffect(() => {
    const id = hash.slice(1);
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, [hash]);

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-20">
        <h1 className="pt-2 font-display text-[28px] font-black tracking-tight text-navy">{p(t.app.servicesTitle)}</h1>
        <p className="mt-1 text-sm text-navy/60">{p(t.app.servicesSub)}</p>

        <ul className="mt-5 flex flex-col gap-3">
          {ROW_CATS.map((id) => {
            const c = CATEGORY_MAP[id];
            if (!c) return null;
            const tint = CATEGORY_TINT[id] ?? { bg: "#ECEFF4", ink: "#0C2B5C" };
            const expanded = open === id;
            return (
              <li key={id} id={id} className="scroll-mt-20 overflow-hidden rounded-3xl border border-navy/10 bg-white">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-3 p-4 text-start active:bg-navy/5"
                >
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                    style={{ background: tint.bg, color: tint.ink }}
                  >
                    <ServiceIcon id={id} className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-base font-extrabold text-navy">{p(c.name)}</span>
                    <span className="block text-xs leading-snug text-navy/60">{p(c.blurb)}</span>
                  </span>
                  <ChevronDown className={`h-5 w-5 shrink-0 text-navy/40 transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
                {expanded && (
                  <div className="border-t border-navy/10">
                    {[...(CATEGORY_PROBLEMS[id] ?? [])].map((problem) => (
                      <Link
                        key={problem}
                        to={bookingHref(problem)}
                        className="flex min-h-12 items-center justify-between gap-3 border-b border-navy/5 px-4 text-sm font-semibold text-navy active:bg-navy/5"
                      >
                        {p(t.picker.problems[problem as keyof typeof t.picker.problems])}
                        <ChevronRight className="h-4 w-4 text-navy/35 rtl:-scale-x-100" />
                      </Link>
                    ))}
                    <Link
                      to={`/book?cat=${id}`}
                      className="flex min-h-12 items-center justify-between gap-3 px-4 text-sm font-bold text-flame-ink active:bg-navy/5"
                    >
                      {p(t.app.somethingElse)}
                      <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <h2 className="mt-8 font-display text-lg font-extrabold tracking-tight text-navy">{p(t.app.otherServices)}</h2>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {OTHER_SERVICES.map((id) => {
            const c = CATEGORY_MAP[id];
            if (!c) return null;
            return (
              <Link
                key={id}
                to={`/book?cat=${id}`}
                className="flex flex-col items-center gap-2 rounded-3xl border border-navy/10 bg-white px-2 py-4 text-center active:scale-95"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-navy/5 text-navy">
                  <ServiceIcon id={id} className="h-5 w-5" />
                </span>
                <span className="text-xs font-bold leading-tight text-navy">{p(c.name)}</span>
              </Link>
            );
          })}
        </div>
      </main>
      <Footer />
    </div>
  );
}
