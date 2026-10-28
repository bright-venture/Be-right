// Admin → Team: specialists and admins, and who handles each service.

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { ServiceSpecialists } from "./ServiceSpecialists";
import { useI18n } from "@/i18n";
import { useConfirm } from "@/hooks/useConfirm";
import { trpc } from "@/providers/trpc";
import { formatMoment } from "@/lib/time";
import { CATEGORY_MAP } from "@contracts/services";
import { CARD, H2, Pending } from "./adminParts";

/** Specialists and admins: add people, change roles, take people off the team. */
export function TeamTab() {
  const { t, p, lang } = useI18n();
  const [confirm, confirmDialog] = useConfirm();
  const utils = trpc.useUtils();
  const { data, error, refetch } = trpc.admin.team.useQuery();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"specialist" | "admin">("specialist");
  const [notice, setNotice] = useState<string | null>(null);
  const add = trpc.admin.addStaff.useMutation({
    onSuccess: ({ invited }, vars) => {
      setNotice(p(invited ? t.admin.invited : t.admin.added).replace("{email}", vars.email));
      setEmail("");
      void utils.admin.team.invalidate();
    },
  });
  const setStaffRole = trpc.admin.setStaffRole.useMutation({ onSuccess: () => utils.admin.team.invalidate() });
  const resetTwoStep = trpc.admin.resetTwoStep.useMutation({
    onSuccess: (_, vars) => {
      const member = data?.find((m) => m.id === vars.userId);
      setNotice(p(t.admin.twoStepResetDone).replace("{name}", member?.name || member?.email || ""));
      void utils.admin.team.invalidate();
    },
  });
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const roleLabel = { specialist: t.admin.roleSpecialist, admin: t.admin.roleAdmin } as const;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (valid) {
      setNotice(null);
      add.mutate({ email: email.trim(), role });
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <form onSubmit={submit} className={`${CARD} flex h-fit flex-col gap-3`}>
          <h2 className={H2}>{p(t.admin.addTitle)}</h2>
          <p className="text-sm text-navy/60">{p(t.admin.addHint)}</p>
          <input
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={p(t.admin.emailPh)}
            aria-label={p(t.admin.emailPh)}
            className="min-h-11 rounded-2xl border-2 border-navy/20 bg-white px-4 text-sm font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none"
          />
          <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-2xl bg-navy/5 p-1">
            {(["specialist", "admin"] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                onClick={() => setRole(r)}
                className={`min-h-10 rounded-xl text-sm font-bold ${role === r ? "bg-white text-navy shadow-[0_2px_8px_rgb(12_43_92/0.1)]" : "text-navy/60"}`}
              >
                {p(roleLabel[r])}
              </button>
            ))}
          </div>
          <button type="submit" disabled={!valid || add.isPending} className="btn-pill-primary justify-center disabled:opacity-40">
            {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {p(t.admin.add)}
          </button>
          {notice && <p role="status" className="text-sm font-semibold text-green-800">{notice}</p>}
          {add.error && <p role="alert" className="text-sm font-semibold text-destructive">{add.error.message}</p>}
        </form>

        <section>
          {!data ? (
            <Pending error={error} retry={() => void refetch()} />
          ) : (
            <ul className="flex flex-col gap-2">
              {data.map((m) => {
                const locked = m.isYou || m.fromSettings;
                return (
                  <li key={m.id} className={`${CARD} flex flex-wrap items-center gap-3 !py-4`}>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-bold text-navy">
                        {m.name || m.email}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            m.role === "admin" ? "bg-navy text-white" : "bg-bird/10 text-bird"
                          }`}
                        >
                          {p(roleLabel[m.role as "specialist" | "admin"])}
                        </span>
                        {m.isYou && <span className="text-xs font-semibold text-navy/50">({p(t.admin.you)})</span>}
                        {m.twoStep !== null && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              m.twoStep ? "bg-green-700/10 text-green-800" : "bg-flame/10 text-flame"
                            }`}
                          >
                            {p(m.twoStep ? t.admin.twoStepOn : t.admin.twoStepOff)}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-sm text-navy/60" dir="ltr">
                        <span className="block text-start">
                          {m.email}
                          {m.phone ? ` · ${m.phone}` : ""}
                        </span>
                      </p>
                      <p className="text-xs text-navy/50">
                        {p(t.admin.lastSignIn)}: {formatMoment(m.lastSignInAt, lang)}
                        {m.fromSettings && ` · ${p(t.admin.fromSettings)}`}
                      </p>
                      {m.role === "specialist" && (
                        <p className={`mt-1 text-xs font-semibold ${m.services.length ? "text-bird" : "text-flame-ink"}`}>
                          {m.services.length
                            ? p(t.serviceOwners.theirs).replace(
                                "{list}",
                                m.services.map((s) => (CATEGORY_MAP[s] ? p(CATEGORY_MAP[s].name) : s)).join(" · "),
                              )
                            : p(t.serviceOwners.noneShort)}
                        </p>
                      )}
                    </div>
                    {!m.isYou && m.twoStep && (
                      <button
                        type="button"
                        disabled={resetTwoStep.isPending}
                        onClick={async () => {
                          const ok = await confirm({
                            title: p(t.admin.twoStepResetAsk).replace("{name}", m.name || m.email || ""),
                            confirmLabel: p(t.admin.twoStepReset),
                          });
                          if (ok) resetTwoStep.mutate({ userId: m.id });
                        }}
                        className="btn-pill-outline !min-h-10 w-full justify-center !px-3 text-xs sm:w-auto"
                      >
                        {p(t.admin.twoStepReset)}
                      </button>
                    )}
                    {!locked && (
                      <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
                        <button
                          type="button"
                          disabled={setStaffRole.isPending}
                          onClick={() => setStaffRole.mutate({ userId: m.id, role: m.role === "admin" ? "specialist" : "admin" })}
                          className="btn-pill-outline !min-h-10 justify-center !px-3 text-xs"
                        >
                          {p(m.role === "admin" ? t.admin.makeSpecialist : t.admin.makeAdmin)}
                        </button>
                        <button
                          type="button"
                          disabled={setStaffRole.isPending}
                          onClick={async () => {
                            const ok = await confirm({
                              title: p(t.admin.removeAsk).replace("{name}", m.name || m.email || ""),
                              confirmLabel: p(t.admin.remove),
                              tone: "danger",
                            });
                            if (ok) setStaffRole.mutate({ userId: m.id, role: "customer" });
                          }}
                          className="btn-pill-outline !min-h-10 justify-center !border-red-700 !px-3 text-xs !text-red-700"
                        >
                          {p(t.admin.remove)}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {confirmDialog}
          {(setStaffRole.error ?? resetTwoStep.error) && (
            <p role="alert" className="mt-3 text-sm font-semibold text-destructive">
              {(setStaffRole.error ?? resetTwoStep.error)?.message}
            </p>
          )}
        </section>
      </div>
      {data && <ServiceSpecialists specialists={data.filter((m) => m.role === "specialist")} />}
    </div>
  );
}
