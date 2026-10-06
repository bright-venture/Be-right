import { Link } from "react-router";
import { ArrowRight, Store } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useI18n } from "@/i18n";
import { CLIENTS } from "@contracts/services";

/** Official client logos, shared with the homepage carousel. */
export default function Clients() {
  const { t, p } = useI18n();
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="dotgrid mx-auto w-full max-w-4xl flex-1 px-4 pb-20 pt-24 sm:px-6">
        <div className="text-center">
          <span
            className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-flame text-white"
            style={{ boxShadow: "0 5px 0 #081E42" }}
          >
            <Store className="h-8 w-8" />
          </span>
          <h1 className="mt-6 font-display text-4xl font-black tracking-tight text-navy sm:text-5xl">
            {p(t.clients.pageTitle)}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-navy/75">
            {p(t.clients.pageSub)}
          </p>
        </div>

        <ul className="mt-10 grid grid-cols-2 gap-3 sm:mt-12 sm:gap-4 lg:grid-cols-3">
          {CLIENTS.map((c) => (
            <li
              key={c.name}
              className="card-br card-hover flex flex-col items-center justify-center gap-1 px-3 py-5 text-center sm:gap-1.5 sm:px-6 sm:py-8"
            >
              <img src={c.logo} alt="" loading="lazy" decoding="async" className="mb-3 h-12 w-full object-contain sm:mb-4 sm:h-20" />
              <span className="font-display text-base font-black tracking-tight text-navy sm:text-xl">
                {c.name}
              </span>
              <span className="text-xs font-bold text-navy/70">{p(c.note)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-10 text-center">
          <Link to="/book" className="btn-pill-primary text-base">
            {p(t.hero.cta)}
            <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
