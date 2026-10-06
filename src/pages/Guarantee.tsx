import { Link } from "react-router";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useI18n } from "@/i18n";
import { GUARANTEE_POINTS } from "@contracts/services";

export default function Guarantee() {
  const { t, p } = useI18n();
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="dotgrid mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-24 sm:px-6">
        <div className="text-center">
          <span
            className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-flame text-white"
            style={{ boxShadow: "0 5px 0 #081E42" }}
          >
            <BadgeCheck className="h-8 w-8" />
          </span>
          <h1 className="mt-6 font-display text-4xl font-black tracking-tight text-navy sm:text-6xl">
            {p(t.guaranteePage.title)}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-navy/75">
            {p(t.guaranteePage.sub)}
          </p>
        </div>

        <ol className="mt-12 flex flex-col gap-4">
          {GUARANTEE_POINTS.map((g, i) => (
            <li key={i} className="card-br card-hover flex items-start gap-4 p-6">
              <span
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy font-display text-base font-black text-paper"
                style={{ boxShadow: "0 3px 0 rgb(244 83 9 / 0.9)" }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-[15px] font-medium leading-relaxed text-navy/85">
                {p(g)}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-10 text-center">
          <Link to="/book" className="btn-pill-primary text-base">
            {p(t.guaranteePage.cta)}
            <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
