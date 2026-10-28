// What the Emergencies tab's pieces share: refresh rate, form layout and styles.

import { type ReactNode } from "react";
import { type Pin } from "@/components/map/LocationPicker";
import { type RequestStatus } from "@contracts/services";
import { CLOSED_STATUSES } from "@contracts/workflow";

/** How often the list checks for newly sent emergencies (the customer is calling). */
export const EMERGENCY_REFRESH_MS = 15_000;

/** What a sent emergency fills in for the specialist; the rest (name, phone...) is taken on the phone. */
export type Prefill = {
  emergencyId: number;
  label: string;
  createdAt: Date;
  category: string;
  problem: string;
  pin: Pin;
  phone: string;
  address: string;
};

export const INPUT =
  "mt-1.5 h-10 w-full rounded-lg border border-navy/15 bg-white px-3 text-sm text-navy placeholder:text-navy/35 transition-colors focus:border-navy/40 focus:outline-none focus:ring-2 focus:ring-flame/20";

export const LABEL = "text-xs font-medium text-navy/65";

export const SECTION_TITLE = "font-display text-base font-extrabold text-navy";

export const CLOSED: readonly RequestStatus[] = CLOSED_STATUSES;

/** A numbered part of the form: 1 Customer, 2 Problem, 3 Location. */
export function Part({ n, title, aside, children }: { n: number; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy text-[11px] font-bold text-white">{n}</span>
        <h3 className="text-sm font-semibold text-navy">{title}</h3>
        {aside && <div className="ms-auto">{aside}</div>}
      </div>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </div>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={LABEL}>{label}</span>
      {children}
    </label>
  );
}
