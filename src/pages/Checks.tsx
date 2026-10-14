import { Link } from "react-router";
import { ArrowRight, ClipboardCheck, Handshake, HardHat, PhoneCall } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useI18n } from "@/i18n";

/** Owner-confirmed technician checks. */
export default function Checks() {
  const { t, p } = useI18n();
  const items = [
    { icon: PhoneCall, title: t.checksPage.s1t, body: t.checksPage.s1b },
    { icon: Handshake, title: t.checksPage.s2t, body: t.checksPage.s2b },
    { icon: HardHat, title: t.checksPage.s3t, body: t.checksPage.s3b },
    { icon: ClipboardCheck, title: t.checksPage.s4t, body: t.checksPage.s4b },
  ];
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="dotgrid mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-24 sm:px-6">
        <div className="text-center">
          <span
            className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-navy text-paper"
            style={{ boxShadow: "0 5px 0 rgb(244 83 9 / 0.9)" }}
          >
            <ClipboardCheck className="h-8 w-8" />
          </span>
          <span className="tech-label mt-6 block text-flame-ink">{p(t.checksPage.kicker)}</span>
          <h1 className="mt-3 font-display text-4xl font-black tracking-tight text-navy sm:text-5xl">
            {p(t.checksPage.title)}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-navy/75">
            {p(t.checksPage.sub)}
          </p>
        </div>

        <ol className="mt-12 grid gap-4 sm:grid-cols-2">
          {items.map((it, i) => (
            <li key={i} className="card-br card-hover p-6">
              <span
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-paper"
                style={{ boxShadow: "0 3px 0 rgb(244 83 9 / 0.9)" }}
              >
                <it.icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 font-display text-lg font-black text-navy">{p(it.title)}</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-navy/70">{p(it.body)}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 text-center">
          <Link to="/book" className="btn-pill-primary text-base">
            {p(t.checksPage.cta)}
            <ArrowRight className="h-5 w-5 rtl:-scale-x-100" />
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
