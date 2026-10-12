import { Link } from "react-router";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useI18n } from "@/i18n";
import { PRIVACY, TERMS } from "@/content/legal";
import { LEGAL_VERSION } from "@contracts/legal";

/** /terms and /privacy */
export default function Legal({ doc }: { doc: "terms" | "privacy" }) {
  const { t, p, lang } = useI18n();
  const content = doc === "terms" ? TERMS : PRIVACY;
  const updated = new Date(`${LEGAL_VERSION}T00:00:00Z`).toLocaleDateString(lang === "ar" ? "ar" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-24 sm:px-6">
        <h1 className="font-display text-3xl font-black text-navy sm:text-4xl">{p(content.title)}</h1>
        <p className="mt-2 text-sm text-navy/70">
          {p(t.legal.lastUpdated)}: {updated}
        </p>
        <nav aria-label={p(t.legal.otherDocs)} className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/terms"
            aria-current={doc === "terms" ? "page" : undefined}
            className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold ${doc === "terms" ? "border-navy bg-navy text-paper" : "border-navy/25 text-navy"}`}
          >
            {p(TERMS.title)}
          </Link>
          <Link
            to="/privacy"
            aria-current={doc === "privacy" ? "page" : undefined}
            className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold ${doc === "privacy" ? "border-navy bg-navy text-paper" : "border-navy/25 text-navy"}`}
          >
            {p(PRIVACY.title)}
          </Link>
        </nav>

        <div className="card-br mt-8 p-5 sm:p-8">
          <p className="leading-relaxed text-navy/80">{p(content.intro)}</p>
          {content.sections.map((s) => (
            <section key={s.title.en} className="mt-8">
              <h2 className="font-display text-xl font-extrabold text-navy">{p(s.title)}</h2>
              {s.paragraphs.map((para) => (
                <p key={para.en.slice(0, 40)} className="mt-3 leading-relaxed text-navy/80">
                  {p(para)}
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
