// The specialist's job preparation, shown on the professional's job card.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { LABEL, type RequestRow } from "./requestDetailParts";

/** Specialist's preparation notes, shown on the technician's job card. */
export function Preparation({ request: r, onSaved }: { request: RequestRow; onSaved: () => void }) {
  const { t, p, lang } = useI18n();
  const [form, setForm] = useState({
    diagnosis: r.prepDiagnosis ?? "",
    tools: r.prepTools ?? "",
    parts: r.prepParts ?? "",
    instructions: r.prepInstructions ?? "",
  });
  const save = trpc.specialist.prepare.useMutation({ onSuccess: onSaved });
  const closed = r.status === "completed" || r.status === "cancelled";
  const fields = [
    { key: "diagnosis", label: t.dash4.prepDiagnosis, ph: t.dash4.prepDiagnosisPh, rows: 2 },
    { key: "tools", label: t.dash4.prepTools, ph: t.dash4.prepToolsPh, rows: 2 },
    { key: "parts", label: t.dash4.prepParts, ph: t.dash4.prepPartsPh, rows: 2 },
    { key: "instructions", label: t.dash4.prepInstructions, ph: t.dash4.prepInstructionsPh, rows: 3 },
  ] as const;

  return (
    <section className="rounded-2xl border-2 border-dashed border-bird/50 bg-bird/5 p-4">
      <p className={LABEL}>{p(t.dash4.prepTitle)}</p>
      <p className="mt-1 text-xs text-navy/70">{p(t.dash4.prepHint)}</p>
      <div className="mt-3 flex flex-col gap-3">
        {fields.map((f) => (
          <label key={f.key} className="flex flex-col text-xs font-bold text-navy">
            {p(f.label)}
            <textarea
              value={form[f.key]}
              onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={p(f.ph)}
              rows={f.rows}
              disabled={closed}
              className="mt-1 w-full rounded-2xl border-2 border-navy/30 bg-white px-3 py-2 text-sm font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none disabled:opacity-60"
            />
          </label>
        ))}
      </div>
      {!closed && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={() => save.mutate({ id: r.id, ...form })} disabled={save.isPending} className="btn-pill-primary !min-h-10 !py-1.5 text-sm">
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {p(t.dash4.prepSave)}
          </button>
          {r.preparedAt && (
            <span className="text-xs text-navy/70">
              {p(t.dash4.prepSaved).replace(
                "{time}",
                new Date(r.preparedAt).toLocaleString(lang === "ar" ? "ar" : "en-GB", { dateStyle: "short", timeStyle: "short" }),
              )}
            </span>
          )}
        </div>
      )}
      {save.error && <p className="mt-2 text-xs font-semibold text-destructive">{save.error.message}</p>}
    </section>
  );
}
