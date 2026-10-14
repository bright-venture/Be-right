import { useState, type ReactNode } from "react";
import { Check, Loader2, MapPin, MessageCircle, Phone, PhoneIncoming, PhoneOutgoing, Send, Wrench } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/router";
import { ServiceIcon } from "@/components/ServiceIcon";
import { DispatchPanel } from "./DispatchPanel";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { telLink, whatsappLink } from "@/lib/contact";
import { formatMoment, timeAgo } from "@/lib/time";
import { emergencyLabel } from "@contracts/emergency";
import { CATEGORY_MAP } from "@contracts/services";

/** How often the list checks for new emergencies (they need a quick answer). */
export const EMERGENCY_REFRESH_MS = 20_000;

type Emergency = inferRouterOutputs<AppRouter>["emergency"]["list"][number];

const ACTION =
  "inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame disabled:opacity-50";
const SECTION_TITLE = "flex items-center gap-2 font-display text-sm font-extrabold uppercase tracking-[0.12em] text-navy/60";

/** Emergencies from the Emergency button: who is calling (or wants a call back) and why. */
export function EmergenciesTab() {
  const { t, p } = useI18n();
  const list = trpc.emergency.list.useQuery(undefined, { refetchInterval: EMERGENCY_REFRESH_MS });

  if (list.isLoading) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-navy" />;
  const rows = list.data ?? [];
  const open = rows.filter((e) => !e.handledAt);
  const handled = rows.filter((e) => e.handledAt);

  return (
    <div className="mt-8 flex flex-col gap-8">
      <section>
        <h2 className={SECTION_TITLE}>
          {p(t.emergency.openTitle)}
          <span className="rounded-md bg-flame px-1.5 py-px text-[11px] tracking-normal text-white">{open.length}</span>
        </h2>
        {open.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-navy/20 bg-white p-6 text-center text-sm text-navy/60">
            {p(t.emergency.empty)}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {open.map((e) => (
              <EmergencyRow key={e.id} e={e} />
            ))}
          </ul>
        )}
      </section>

      {handled.length > 0 && (
        <section>
          <h2 className={SECTION_TITLE}>
            {p(t.emergency.handledTitle)}
            <span className="rounded-md bg-navy/10 px-1.5 py-px text-[11px] tracking-normal text-navy">{handled.length}</span>
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {handled.map((e) => (
              <EmergencyRow key={e.id} e={e} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy/45">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-navy">{children}</p>
    </div>
  );
}

function EmergencyRow({ e }: { e: Emergency }) {
  const { t, p, lang } = useI18n();
  const utils = trpc.useUtils();
  const markHandled = trpc.emergency.markHandled.useMutation({ onSettled: () => utils.emergency.list.invalidate() });
  const [dispatching, setDispatching] = useState(false);
  const open = !e.handledAt;
  const callback = e.kind === "callback";
  const KindIcon = callback ? PhoneIncoming : PhoneOutgoing;
  const service = CATEGORY_MAP[e.category] ? p(CATEGORY_MAP[e.category].name) : e.category;

  return (
    <li
      className={`relative overflow-hidden rounded-2xl border bg-white shadow-[0_1px_2px_rgb(12_43_92/0.06)] ${
        open ? "border-navy/15" : "border-navy/10 opacity-75"
      }`}
    >
      {/* Status bar: orange while someone is waiting. */}
      <span aria-hidden className={`absolute inset-y-0 start-0 w-1 ${open ? "bg-flame" : "bg-navy/15"}`} />

      <div className="grid gap-4 p-4 ps-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-6">
        {/* What and when */}
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-flame/10 text-flame">
            <ServiceIcon id={e.category} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="font-display text-[15px] font-extrabold leading-snug text-navy">{p(emergencyLabel(e.category, e.problem))}</p>
              <span
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                  callback ? "bg-flame/10 text-flame-ink" : "bg-navy/[0.06] text-navy/70"
                }`}
              >
                <KindIcon className="h-3 w-3" />
                {p(callback ? t.emergency.callback : t.emergency.calling)}
              </span>
            </div>
            {e.address && (
              <p className="mt-1 flex items-start gap-1 text-xs text-navy/70">
                <MapPin className="mt-px h-3.5 w-3.5 shrink-0 text-flame" />
                <span className="line-clamp-2">{e.address}</span>
              </p>
            )}
            <p className="mt-0.5 text-xs text-navy/60">
              {service} · <time dateTime={new Date(e.createdAt).toISOString()} title={formatMoment(e.createdAt, lang)}>{timeAgo(e.createdAt, lang)}</time>
            </p>
          </div>
        </div>

        {/* Who */}
        {e.name || e.phone ? (
          <div className="grid grid-cols-2 gap-4 border-t border-navy/10 pt-3 lg:border-0 lg:pt-0">
            <Field label={p(t.emergency.contactName)}>{e.name ?? "-"}</Field>
            <Field label={p(t.emergency.contactPhone)}>
              <span dir="ltr">{e.phone ?? "-"}</span>
            </Field>
          </div>
        ) : (
          <p className="border-t border-navy/10 pt-3 text-sm text-navy/50 lg:border-0 lg:pt-0">{p(t.emergency.noContact)}</p>
        )}

        {/* Actions: two rows of two on phones, a compact row on computers. */}
        {open ? (
          <div className="grid grid-cols-2 gap-2 lg:flex lg:justify-end">
            {e.phone ? (
              <a href={telLink(e.phone)} className={`${ACTION} bg-flame text-white hover:bg-flame-ink`}>
                <Phone className="h-4 w-4 shrink-0" />
                {p(t.emergency.callNow)}
              </a>
            ) : (
              <span className={`${ACTION} cursor-not-allowed bg-navy/5 text-navy/35`} aria-disabled>
                <Phone className="h-4 w-4 shrink-0" />
                {p(t.emergency.callNow)}
              </span>
            )}
            {e.phone ? (
              <a
                href={whatsappLink(e.phone)}
                target="_blank"
                rel="noreferrer"
                className={`${ACTION} border border-navy/15 text-navy hover:bg-navy/5`}
              >
                <MessageCircle className="h-4 w-4 shrink-0" />
                WhatsApp
              </a>
            ) : (
              <span className={`${ACTION} cursor-not-allowed border border-navy/10 text-navy/35`} aria-disabled>
                <MessageCircle className="h-4 w-4 shrink-0" />
                WhatsApp
              </span>
            )}
            <button
              type="button"
              onClick={() => setDispatching((v) => !v)}
              aria-expanded={dispatching}
              className={`${ACTION} ${dispatching ? "bg-navy/90" : "bg-navy"} text-white hover:bg-navy/90`}
            >
              <Send className="h-4 w-4 shrink-0" />
              <span className="truncate">{p(t.emergency.sendTech)}</span>
            </button>
            <button
              type="button"
              onClick={() => markHandled.mutate({ id: e.id })}
              disabled={markHandled.isPending}
              className={`${ACTION} border border-navy/15 text-navy hover:bg-navy/5`}
            >
              {markHandled.isPending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Check className="h-4 w-4 shrink-0" />}
              <span className="truncate">{p(t.emergency.markHandled)}</span>
            </button>
          </div>
        ) : e.requestId ? (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-navy/70 lg:justify-end">
            <Wrench className="h-3.5 w-3.5 text-flame" />
            {p(t.emergency.sentTo)
              .replace("{name}", e.technicianName ?? "-")
              .replace("{id}", String(e.requestId))}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-navy/55 lg:justify-end">
            <Check className="h-3.5 w-3.5" />
            {p(t.emergency.handled).replace("{time}", formatMoment(e.handledAt!, lang))}
          </p>
        )}
      </div>
      {open && dispatching && <DispatchPanel e={e} onClose={() => setDispatching(false)} />}
    </li>
  );
}
