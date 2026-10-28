import { Check } from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { CATEGORY_MAP, SERVICES_IN_ORDER } from "@contracts/services";

/**
 * Admin → Team: who handles each service. Tap a specialist to add them to a service or take
 * them off it: a service can have several, and one person several services. Only they get its
 * requests, emergencies, emails and notifications; with nobody, the admins handle it, as they
 * always do for Other.
 */
export function ServiceSpecialists({ specialists }: { specialists: { id: number; name: string | null; email: string | null }[] }) {
  const { t, p } = useI18n();
  const utils = trpc.useUtils();
  const owners = trpc.admin.serviceSpecialists.useQuery();
  const set = trpc.admin.setServiceSpecialist.useMutation({
    onSuccess: () => {
      void utils.admin.serviceSpecialists.invalidate();
      void utils.admin.team.invalidate();
    },
  });
  const has = (service: string, id: number) => !!owners.data?.some((o) => o.service === service && o.specialistId === id);
  const uncovered = SERVICES_IN_ORDER.filter((s) => !owners.data?.some((o) => o.service === s)).length;

  return (
    <section className="rounded-3xl border border-navy/10 bg-white p-5 shadow-[0_1px_2px_rgb(12_43_92/0.06)]">
      <h2 className="font-display text-lg font-black text-navy">{p(t.serviceOwners.title)}</h2>
      <p className="mt-1 text-sm text-navy/60">{p(t.serviceOwners.hint)}</p>
      {owners.data && uncovered > 0 && (
        <p className="mt-2 text-sm font-semibold text-flame-ink">{p(t.serviceOwners.uncovered).replace("{n}", String(uncovered))}</p>
      )}
      {specialists.length === 0 ? (
        <p className="mt-4 text-sm font-semibold text-navy/70">{p(t.serviceOwners.noSpecialists)}</p>
      ) : (
        <ul className="mt-4 grid gap-x-6 gap-y-3 md:grid-cols-2">
          {SERVICES_IN_ORDER.map((service) => {
            const name = p(CATEGORY_MAP[service].name);
            const nobody = !specialists.some((s) => has(service, s.id));
            return (
              <li key={service} className="rounded-2xl border border-navy/10 p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy/5 text-bird">
                    <ServiceIcon id={service} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-navy">{name}</span>
                  {nobody && <span className="shrink-0 text-xs font-semibold text-navy/50">{p(t.serviceOwners.admins)}</span>}
                </div>
                <div role="group" aria-label={p(t.serviceOwners.pick).replace("{service}", name)} className="mt-2 flex flex-wrap gap-1.5">
                  {specialists.map((s) => {
                    const on = has(service, s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={on}
                        disabled={!owners.data || set.isPending}
                        onClick={() => set.mutate({ service, specialistId: s.id, on: !on })}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border-2 px-3 text-xs font-bold transition-colors disabled:opacity-60 ${
                          on ? "border-navy bg-navy text-white" : "border-navy/15 bg-white text-navy/70 hover:border-navy/40"
                        }`}
                      >
                        {on && <Check className="h-3.5 w-3.5" />}
                        {s.name || s.email}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-navy/60">{p(t.serviceOwners.other)}</p>
      {set.error && <p role="alert" className="mt-2 text-sm font-semibold text-destructive">{set.error.message}</p>}
    </section>
  );
}
