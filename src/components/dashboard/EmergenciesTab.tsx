import { useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import { useI18n } from "@/i18n";
import { type Prefill } from "./emergencyParts";
import { EmergencyJobForm } from "./EmergencyJobForm";
import { OpenEmergencies } from "./OpenEmergencies";

/**
 * Emergencies. A customer sent a priority dispatch (what's wrong and where) and is calling,
 * or simply called the emergency line. While on the phone, the specialist fills in the rest
 * (opening a sent emergency fills in what the customer gave) and sends a technician; the job
 * lands in the technician's app, scheduled for now and marked Emergency. Below: emergencies
 * waiting for the call, and the emergency jobs still open.
 */
export function EmergenciesTab() {
  const { t, p } = useI18n();
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  // Each new form (blank, or from a sent emergency) starts fresh.
  const [formKey, setFormKey] = useState(0);
  const [sent, setSent] = useState<{ id: number; technician: string } | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const open = (next: Prefill) => {
    setPrefill(next);
    setSent(null);
    setFormKey((k) => k + 1);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const reset = () => {
    setPrefill(null);
    setFormKey((k) => k + 1);
  };

  return (
    <div ref={top} className="mt-8 flex scroll-mt-24 flex-col gap-10">
      <div className="flex flex-col gap-3">
        {sent && (
          <p role="status" className="flex items-center gap-2 rounded-xl border border-green-700/20 bg-green-700/[0.06] px-4 py-3 text-sm font-medium text-navy">
            <CircleCheck className="h-4 w-4 shrink-0 text-green-700" />
            {p(t.emergency.sentTo).replace("{name}", sent.technician).replace("{id}", String(sent.id))}
          </p>
        )}
        <EmergencyJobForm
          key={formKey}
          prefill={prefill}
          onClear={reset}
          onSent={(job) => {
            setSent(job);
            reset();
          }}
        />
      </div>
      <OpenEmergencies onOpen={open} />
    </div>
  );
}
