import { useState } from "react";
import { Link } from "react-router";
import { ChevronRight, Loader2, MapPin } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ServiceIcon } from "@/components/ServiceIcon";
import { StatusBadge } from "@/components/requests/RequestParts";
import { useI18n } from "@/i18n";
import { useRoleGate } from "@/hooks/useRoleGate";
import { trpc } from "@/providers/trpc";
import { formatVisitDay } from "@/lib/time";
import { CATEGORY_MAP, CATEGORY_TINT, STATUS_ORDER, type RequestStatus } from "@contracts/services";

/** Requests that are finished one way or another: they go under "Past". */
const CLOSED: readonly RequestStatus[] = ["completed", "cancelled"];

/** The phone app's requests list: active and past requests as cards; each opens its own screen. */
export default function AppRequests() {
  const { t, p, lang } = useI18n();
  const { role, isLoading: authLoading } = useRoleGate(["customer"], { requireSignIn: true });
  const list = trpc.requests.mine.useQuery(undefined, { enabled: role === "customer" });
  const [tab, setTab] = useState<"active" | "past">("active");

  if (authLoading || role !== "customer") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Loader2 className="h-8 w-8 animate-spin text-navy" />
      </div>
    );
  }

  const rows = list.data ?? [];
  const active = rows.filter((r) => !CLOSED.includes(r.status as RequestStatus));
  const past = rows.filter((r) => CLOSED.includes(r.status as RequestStatus));
  const shown = tab === "active" ? active : past;
  const slot: Record<string, string> = {
    morning: p(t.book.slotMorning),
    afternoon: p(t.book.slotAfternoon),
    evening: p(t.book.slotEvening),
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-20">
        <h1 className="pt-2 font-display text-[28px] font-black tracking-tight text-navy">{p(t.requests.title)}</h1>

        {/* Active / Past */}
        <div role="tablist" className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-navy/5 p-1">
          {(
            [
              ["active", t.app.active, active.length],
              ["past", t.app.past, past.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors ${
                tab === key ? "bg-white text-navy shadow-[0_2px_8px_rgb(12_43_92/0.1)]" : "text-navy/60"
              }`}
            >
              {p(label)}
              <span
                className={`min-w-6 rounded-full px-1.5 text-xs tabular-nums ${
                  tab === key ? "bg-flame text-white" : "bg-navy/10 text-navy/60"
                }`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        {list.isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-navy" />
          </div>
        )}

        {!list.isLoading && shown.length === 0 && (
          <div className="mt-6 flex flex-col items-center rounded-3xl border border-navy/10 bg-white px-6 py-10 text-center">
            <img src="/assets/mascot-320.webp" width={320} height={408} alt="" className="h-auto w-20" />
            <p className="mt-4 text-sm font-semibold text-navy/70">{p(tab === "active" ? t.app.noActive : t.app.noPast)}</p>
            {tab === "active" && (
              <Link to="/book" className="btn-pill-primary mt-5 !min-h-11 !px-6 text-sm">
                {p(t.nav.book)}
              </Link>
            )}
          </div>
        )}

        <ul className="mt-4 flex flex-col gap-3">
          {shown.map((r) => {
            const status = r.status as RequestStatus;
            const cat = CATEGORY_MAP[r.category];
            const tint = CATEGORY_TINT[r.category] ?? { bg: "#ECEFF4", ink: "#0C2B5C" };
            const step = STATUS_ORDER.indexOf(status);
            return (
              <li key={r.id}>
                <Link
                  to={`/requests/${r.id}`}
                  className="block overflow-hidden rounded-3xl border border-navy/10 bg-white active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3 p-4">
                    <span
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                      style={{ background: tint.bg, color: tint.ink }}
                    >
                      <ServiceIcon id={r.category} className="h-6 w-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="truncate font-display text-base font-extrabold text-navy">
                          {cat ? p(cat.name) : r.category}
                        </span>
                        <span className="text-xs font-bold text-navy/50">#{r.id}</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-navy/60">
                        {formatVisitDay(r.preferredDate, lang)} · {slot[r.timeSlot] ?? r.timeSlot}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-navy/60">
                        <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="truncate">{r.area}</span>
                      </span>
                      {r.guaranteeFor && (
                        <span className="mt-1 inline-block rounded-full bg-bird px-2 py-0.5 text-[10px] font-bold text-white">
                          {p(t.requests.guaranteeBadge)}
                        </span>
                      )}
                    </span>
                    <StatusBadge status={status} />
                  </div>

                  {/* how far along an active request is */}
                  {!CLOSED.includes(status) && (
                    <div className="flex gap-1 px-4 pb-4" aria-hidden>
                      {STATUS_ORDER.filter((s) => s !== "cancelled").map((s, i) => (
                        <span key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-flame" : "bg-navy/10"}`} />
                      ))}
                    </div>
                  )}

                  {/* the one thing the customer has to do */}
                  {status === "quote_ready" && (
                    <span className="flex items-center justify-between gap-3 bg-flame px-4 py-3 text-sm font-bold text-white">
                      {p(t.app.reviewQuote).replace("{amount}", r.quoteAmount ? `$${r.quoteAmount}` : "")}
                      <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
      <Footer />
    </div>
  );
}
