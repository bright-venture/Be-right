import { Link } from "react-router";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useI18n } from "@/i18n";

export default function NotFound() {
  const { t, p } = useI18n();
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="dotgrid flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        <p className="ghost-num text-[120px] sm:text-[180px]" aria-hidden>
          404
        </p>
        <h1 className="mt-2 font-display text-3xl font-black text-navy">{p(t.notFound.title)}</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-navy/70">{p(t.notFound.body)}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link to="/" className="btn-pill-outline">
            {p(t.join.backHome)}
          </Link>
          <Link to="/book" className="btn-pill-primary">
            {p(t.nav.book)}
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
