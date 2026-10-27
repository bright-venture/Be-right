import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { TRANSPORT, TRANSPORT_LABELS, type Transport } from "@contracts/applications";

/**
 * Admin: how a professional gets to jobs (asked when they apply; shown to the team).
 */
export function TransportEditor({
  tech: x,
  onDone,
}: {
  tech: { id: number; name: string | null; email?: string | null; transport: Transport | null };
  onDone: () => void;
}) {
  const { t, p } = useI18n();
  const utils = trpc.useUtils();
  const [transport, setTransport] = useState<Transport | "">(x.transport ?? "");
  const save = trpc.tech.setTransport.useMutation({
    onSuccess: () => {
      void utils.tech.list.invalidate();
      onDone();
    },
  });

  return (
    <div className="border-t border-navy/10 bg-navy/[0.02] px-4 py-4">
      <p className="font-display text-sm font-extrabold text-navy">{p(t.techInfo.transportTitle).replace("{name}", x.name ?? x.email ?? "")}</p>
      <p className="mt-0.5 text-xs text-navy/60">{p(t.techInfo.transportHint)}</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block w-full sm:w-64">
          <span className="text-xs font-medium text-navy/65">{p(t.techInfo.transport)}</span>
          <select
            value={transport}
            onChange={(e) => setTransport(e.target.value as Transport)}
            className="mt-1.5 h-10 w-full rounded-lg border border-navy/15 bg-white px-3 text-sm font-semibold text-navy focus:border-navy/40 focus:outline-none"
          >
            <option value="" disabled>
              {p(t.techInfo.transport)}
            </option>
            {TRANSPORT.map((m) => (
              <option key={m} value={m}>
                {p(TRANSPORT_LABELS[m])}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-navy/15 px-4 text-sm font-semibold text-navy hover:bg-navy/5"
        >
          {p(t.techInfo.cancel)}
        </button>
        <button
          type="button"
          disabled={!transport || transport === x.transport || save.isPending}
          onClick={() => transport && save.mutate({ technicianId: x.id, transport })}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-navy px-4 text-sm font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {p(t.techInfo.save)}
        </button>
      </div>
      {save.error && <p className="mt-2 text-xs font-semibold text-red-700">{save.error.message}</p>}
    </div>
  );
}
