// What the request detail's pieces share: the data types and a few styles.

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/router";

type Outputs = inferRouterOutputs<AppRouter>;

export type Technician = Outputs["tech"]["list"][number];

export const LABEL = "font-display text-xs font-bold uppercase tracking-[0.2em] text-navy/70";

export const INPUT =
  "min-h-11 w-full rounded-2xl border-2 border-navy/30 bg-white px-4 text-sm font-semibold text-navy placeholder:font-normal placeholder:text-navy/40 focus:border-flame focus:outline-none";

export const SMALL_BTN = "btn-pill-outline !min-h-10 !px-4 !py-1.5 text-xs";

export type RequestRow = Outputs["specialist"]["detail"]["request"];
