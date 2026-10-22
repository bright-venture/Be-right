import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import LocationPicker, { type Pin } from "@/components/map/LocationPicker";

/**
 * A technician's starting point (home or work base), which they set themselves: the team
 * prices their jobs with the distance from here to the customer. Only the team sees it.
 */
export function MyStartPoint() {
  const { t, p } = useI18n();
  const utils = trpc.useUtils();
  const profile = trpc.auth.profile.useQuery(undefined, { staleTime: 60_000 });
  const saved = profile.data?.technician?.base ?? null;
  // null until the technician moves the pin: the saved point shows meanwhile.
  const [pin, setPin] = useState<Pin | null>(null);
  const save = trpc.tech.setMyBase.useMutation({
    onSuccess: () => {
      setPin(null);
      void utils.auth.profile.invalidate();
    },
  });
  const shown = pin ?? saved;

  return (
    <section className="card-br p-5 sm:p-6">
      <h2 className="font-display text-lg font-extrabold text-navy">{p(t.account.startTitle)}</h2>
      <p className="mt-1 text-sm text-navy/70">{p(t.account.startHint)}</p>
      {!saved && !profile.isLoading && (
        <p className="mt-3 rounded-xl bg-flame/10 px-3 py-2 text-sm font-semibold text-flame-ink">{p(t.account.startMissing)}</p>
      )}
      <div className="mt-4">
        {profile.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-navy" />
        ) : (
          <LocationPicker value={shown} onChange={setPin} />
        )}
      </div>
      <button
        type="button"
        disabled={!pin || save.isPending}
        onClick={() => pin && save.mutate(pin)}
        className="btn-pill-primary mt-4 disabled:opacity-40"
      >
        {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {p(t.account.startSave)}
      </button>
      {save.isSuccess && !pin && (
        <p role="status" className="mt-3 text-sm font-semibold text-green-800">
          {p(t.account.startSaved)}
        </p>
      )}
      {save.error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-destructive">
          {save.error.message}
        </p>
      )}
    </section>
  );
}
