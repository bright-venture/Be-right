import { Loader2, Phone, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { telLink, whatsappLink } from "@/lib/contact";
import { formatMoment } from "@/lib/time";
import { emergencyLabel } from "@contracts/emergency";
import { CATEGORY_MAP } from "@contracts/services";

/** How often the list checks for new emergencies (they need a quick answer). */
export const EMERGENCY_REFRESH_MS = 20_000;

/** Emergencies from the Emergency button: who is calling (or wants a call back) and why. */
export function EmergenciesTab() {
  const { t, p, lang } = useI18n();
  const utils = trpc.useUtils();
  const list = trpc.emergency.list.useQuery(undefined, { refetchInterval: EMERGENCY_REFRESH_MS });
  const markHandled = trpc.emergency.markHandled.useMutation({ onSettled: () => utils.emergency.list.invalidate() });

  if (list.isLoading) return <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-navy" />;
  const rows = list.data ?? [];
  if (rows.length === 0) {
    return <div className="card-br mt-8 p-8 text-center text-sm font-semibold text-navy/70">{p(t.emergency.empty)}</div>;
  }

  return (
    <ul className="mt-8 grid gap-3 lg:grid-cols-2">
      {rows.map((e) => {
        const open = !e.handledAt;
        const KindIcon = e.kind === "callback" ? PhoneIncoming : PhoneOutgoing;
        return (
          <li
            key={e.id}
            className={`card-br flex flex-col gap-3 p-4 ${open ? "!border-flame" : "opacity-70"}`}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-flame/10 text-flame">
                <ServiceIcon id={e.category} className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-extrabold text-navy">{p(emergencyLabel(e.category, e.problem))}</p>
                <p className="text-xs text-navy/70">
                  {CATEGORY_MAP[e.category] ? p(CATEGORY_MAP[e.category].name) : e.category} · {formatMoment(e.createdAt, lang)}
                </p>
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                  e.kind === "callback" ? "bg-flame text-white" : "bg-navy/10 text-navy"
                }`}
              >
                <KindIcon className="h-3.5 w-3.5" />
                {p(e.kind === "callback" ? t.emergency.callback : t.emergency.calling)}
              </span>
            </div>

            {e.name || e.phone ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                {e.name && <span className="font-bold text-navy">{e.name}</span>}
                {e.phone && (
                  <>
                    <span className="text-navy/80" dir="ltr">
                      {e.phone}
                    </span>
                    <a href={telLink(e.phone)} className="btn-pill-primary !min-h-10 !px-4 text-sm">
                      <Phone className="h-4 w-4" />
                      {p(t.emergency.callNow)}
                    </a>
                    <a
                      href={whatsappLink(e.phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-pill-outline !min-h-10 !px-4 text-sm"
                    >
                      WhatsApp
                    </a>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-navy/60">{p(t.emergency.noContact)}</p>
            )}

            {open ? (
              <button
                type="button"
                onClick={() => markHandled.mutate({ id: e.id })}
                disabled={markHandled.isPending}
                className="btn-pill-outline !min-h-10 self-start text-sm"
              >
                {markHandled.isPending && markHandled.variables?.id === e.id && <Loader2 className="h-4 w-4 animate-spin" />}
                {p(t.emergency.markHandled)}
              </button>
            ) : (
              <p className="text-xs font-bold text-navy/60">
                {p(t.emergency.handled).replace("{time}", formatMoment(e.handledAt!, lang))}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
