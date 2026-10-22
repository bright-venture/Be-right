import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { DistrictPicker } from "@/components/DistrictPicker";
import type { District } from "@contracts/districts";

/** Admin: the districts a technician works in (they're only suggested and assigned there). */
export function DistrictsEditor({
  tech: x,
  onDone,
}: {
  tech: { id: number; name: string | null; email?: string | null; districts: District[] };
  onDone: () => void;
}) {
  const { t, p } = useI18n();
  const utils = trpc.useUtils();
  const [districts, setDistricts] = useState<District[]>(x.districts);
  const save = trpc.tech.setDistricts.useMutation({
    onSuccess: () => {
      void utils.tech.list.invalidate();
      void utils.pricing.suggest.invalidate();
      onDone();
    },
  });
  const unchanged = districts.length === x.districts.length && districts.every((d) => x.districts.includes(d));

  return (
    <div className="border-t border-navy/10 bg-navy/[0.02] px-4 py-4">
      <p className="font-display text-sm font-extrabold text-navy">{p(t.districts.editTitle).replace("{name}", x.name ?? x.email ?? "")}</p>
      <p className="mb-3 mt-0.5 text-xs text-navy/60">{p(t.districts.editHint)}</p>
      <DistrictPicker value={districts} onChange={setDistricts} compact />
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-navy/15 px-4 text-sm font-semibold text-navy hover:bg-navy/5"
        >
          {p(t.districts.cancel)}
        </button>
        <button
          type="button"
          disabled={!districts.length || unchanged || save.isPending}
          onClick={() => save.mutate({ technicianId: x.id, districts })}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-navy px-4 text-sm font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {p(t.districts.save)}
        </button>
      </div>
      {save.error && <p className="mt-2 text-xs font-semibold text-red-700">{save.error.message}</p>}
    </div>
  );
}
