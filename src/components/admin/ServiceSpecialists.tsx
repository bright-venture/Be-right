import { Loader2 } from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { CATEGORY_MAP, SERVICES_IN_ORDER } from "@contracts/services";

const SELECT =
  "min-h-10 w-full min-w-0 rounded-xl border-2 border-navy/20 bg-white px-3 text-sm font-semibold text-navy focus:border-flame focus:outline-none";

/**
 * Admin → Team: who handles each service. One specialist per service (one person can have
 * several); only they get its requests, emergencies and emails. "Admins": nobody yet, the
 * admins handle it, as they always do for Other.
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
  const ownerOf = (service: string) => owners.data?.find((o) => o.service === service)?.specialistId ?? null;
  const uncovered = SERVICES_IN_ORDER.filter((s) => ownerOf(s) === null).length;

  return (
    <section className="rounded-3xl border border-navy/10 bg-white p-5 shadow-[0_1px_2px_rgb(12_43_92/0.06)]">
      <h2 className="font-display text-lg font-black text-navy">{p(t.serviceOwners.title)}</h2>
      <p className="mt-1 text-sm text-navy/60">{p(t.serviceOwners.hint)}</p>
      {owners.data && uncovered > 0 && (
        <p className="mt-2 text-sm font-semibold text-flame-ink">{p(t.serviceOwners.uncovered).replace("{n}", String(uncovered))}</p>
      )}
      {!owners.data ? (
        <Loader2 className="mt-4 h-5 w-5 animate-spin text-navy/40" />
      ) : (
        <ul className="mt-4 grid gap-x-6 gap-y-2 md:grid-cols-2">
          {SERVICES_IN_ORDER.map((service) => (
            <li key={service} className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy/5 text-bird">
                <ServiceIcon id={service} className="h-4 w-4" />
              </span>
              <span className="truncate text-sm font-bold text-navy">{p(CATEGORY_MAP[service].name)}</span>
              <select
                value={ownerOf(service) ?? ""}
                disabled={set.isPending}
                onChange={(e) => set.mutate({ service, specialistId: e.target.value ? Number(e.target.value) : null })}
                aria-label={p(t.serviceOwners.pick).replace("{service}", p(CATEGORY_MAP[service].name))}
                className={`${SELECT} ${ownerOf(service) === null ? "text-navy/60" : ""}`}
              >
                <option value="">{p(t.serviceOwners.admins)}</option>
                {specialists.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.email}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-navy/60">{p(t.serviceOwners.other)}</p>
      {set.error && <p role="alert" className="mt-2 text-sm font-semibold text-destructive">{set.error.message}</p>}
    </section>
  );
}
