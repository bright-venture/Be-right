// Admin → Customers: every customer account and their requests.

import { useEffect, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { StatusBadge } from "@/components/requests/RequestParts";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { formatMoment } from "@/lib/time";
import { CATEGORY_MAP, type RequestStatus } from "@contracts/services";
import { LoadMore, Pending } from "./adminParts";

/** Every customer account: search, and open one to see their requests. */
export function CustomersTab() {
  const { t, p, lang } = useI18n();
  const [query, setQuery] = useState("");
  // Searched on the server (there may be thousands): a moment after typing stops.
  const [search, setSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);
  const list = trpc.admin.customers.useInfiniteQuery(
    { search: search || null },
    { getNextPageParam: (last) => last.nextCursor, placeholderData: keepPreviousData },
  );
  const [open, setOpen] = useState<number | null>(null);
  const day = (d: Date | string | null) =>
    d ? new Date(d).toLocaleDateString(lang === "ar" ? "ar" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-";

  if (!list.data) return <Pending error={list.error} retry={() => void list.refetch()} />;
  const shown = list.data.pages.flatMap((page) => page.items);
  const total = list.data.pages[0]?.total ?? shown.length;
  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={p(t.admin.searchPh)}
            aria-label={p(t.admin.searchPh)}
            className="min-h-11 w-full rounded-2xl border-2 border-navy/20 bg-white pe-4 ps-10 text-sm font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none"
          />
        </label>
        <span className="text-sm font-semibold text-navy/60">{p(t.admin.customerCount).replace("{n}", String(total))}</span>
      </div>

      {shown.length === 0 ? (
        <p className="mt-6 text-sm text-navy/60">{p(t.admin.noResults)}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {shown.map((c) => (
            <li key={c.id} className="overflow-hidden rounded-2xl border border-navy/10 bg-white">
              <button
                type="button"
                onClick={() => setOpen(open === c.id ? null : c.id)}
                aria-expanded={open === c.id}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-3 p-4 text-start sm:grid-cols-[2fr_2fr_1fr_1fr_auto]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold text-navy">{c.name || "-"}</span>
                  {c.deletedAt && <span className="text-xs font-bold text-destructive">{p(t.admin.deleted)}</span>}
                </span>
                <span className="hidden min-w-0 text-sm text-navy/70 sm:block" dir="ltr">
                  <span className="block truncate text-start">{c.email}</span>
                  <span className="block truncate text-start">{c.phone}</span>
                </span>
                <span className="hidden text-sm text-navy/70 sm:block">
                  <span className="block text-xs text-navy/50">{p(t.admin.joined)}</span>
                  {day(c.createdAt)}
                </span>
                <span className="hidden text-sm text-navy/70 sm:block">
                  <span className="block text-xs text-navy/50">{p(t.admin.lastRequest)}</span>
                  {day(c.lastRequestAt)}
                </span>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-navy/5 px-2.5 py-0.5 text-xs font-bold tabular-nums text-navy">{c.requests}</span>
                  <ChevronDown className={`h-4 w-4 text-navy/40 transition-transform ${open === c.id ? "rotate-180" : ""}`} />
                </span>
              </button>
              {open === c.id && <CustomerRequests id={c.id} email={c.email} phone={c.phone} lastSignIn={day(c.lastSignInAt)} />}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-center">
        <LoadMore list={list} />
      </div>
    </div>
  );
}

function CustomerRequests({ id, email, phone, lastSignIn }: { id: number; email: string | null; phone: string | null; lastSignIn: string }) {
  const { t, p, lang } = useI18n();
  const { data } = trpc.admin.customerRequests.useQuery({ id });
  return (
    <div className="border-t border-navy/10 bg-paper p-4">
      <p className="text-sm text-navy/70 sm:hidden" dir="ltr">
        {email} · {phone}
      </p>
      <p className="text-xs text-navy/50">
        {p(t.admin.lastSignIn)}: {lastSignIn}
      </p>
      {!data ? (
        <Loader2 className="mt-3 h-5 w-5 animate-spin text-navy" />
      ) : data.length === 0 ? (
        <p className="mt-3 text-sm text-navy/60">{p(t.admin.noRequests)}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm">
              <ServiceIcon id={r.category} className="h-4 w-4 text-bird" />
              <span className="font-bold text-navy">
                #{r.id} {CATEGORY_MAP[r.category] ? p(CATEGORY_MAP[r.category].name) : r.category}
              </span>
              <span className="text-navy/60">{r.area}</span>
              <span className="text-navy/60">{formatMoment(r.createdAt, lang)}</span>
              <span className="ms-auto flex items-center gap-2">
                {r.visitFeeReason ? (
                  <span className="font-bold tabular-nums text-navy">${r.visitFee}</span>
                ) : (
                  r.quoteAmount && <span className="font-bold tabular-nums text-navy">${r.quoteAmount}</span>
                )}
                <StatusBadge status={r.status as RequestStatus} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
