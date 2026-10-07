// The home page's service picker: which problems it offers, and how each one pre-fills
// the booking form (src/components/CategoryPicker.tsx → /book?cat=…&ans=…).

export const PROBLEM_MAP: Record<string, { cat: string; answers: Record<string, string> }> = {
  leak: { cat: "plumbing", answers: { problem: "leak" } },
  "blocked-toilet": { cat: "plumbing", answers: { problem: "blocked" } },
  "locked-out": { cat: "carpentry", answers: { item: "door" } },
  "broken-door-window": { cat: "carpentry", answers: { item: "door" } },
  "no-power": { cat: "electrical", answers: { problem: "no_power" } },
  "damaged-roof": { cat: "painting", answers: {} },
  "no-hot-water": { cat: "plumbing", answers: { problem: "heater" } },
  "blocked-drain": { cat: "plumbing", answers: { problem: "blocked" } },
  "tap-toilet": { cat: "plumbing", answers: { problem: "fixture" } },
  "water-pump": { cat: "plumbing", answers: { problem: "pump" } },
  "water-tank": { cat: "plumbing", answers: { problem: "leak", location: "tank" } },
  "water-heater": { cat: "plumbing", answers: { problem: "heater" } },
  "no-light-power": { cat: "electrical", answers: { problem: "no_power" } },
  "socket-switch": { cat: "electrical", answers: { problem: "socket" } },
  // No "breaker" answer in the form: the customer picks the closest one.
  breaker: { cat: "electrical", answers: {} },
  "generator-inverter": { cat: "electrical", answers: { problem: "generator" } },
  "fan-light": { cat: "electrical", answers: { problem: "lights" } },
  "ac-not-cooling": { cat: "ac", answers: { service: "not_cooling" } },
  "ac-leak": { cat: "ac", answers: { service: "leaking" } },
  "ac-noise": { cat: "ac", answers: { service: "noise" } },
  "ac-cleaning": { cat: "ac", answers: { service: "cleaning" } },
  "ac-install": { cat: "ac", answers: { service: "install" } },
  fridge: { cat: "appliance", answers: {} },
  washer: { cat: "appliance", answers: {} },
  oven: { cat: "appliance", answers: {} },
  dishwasher: { cat: "appliance", answers: {} },
  "door-lock": { cat: "carpentry", answers: { item: "door" } },
  wardrobe: { cat: "carpentry", answers: { item: "cabinet" } },
  furniture: { cat: "carpentry", answers: { item: "furniture" } },
  "carpentry-other": { cat: "carpentry", answers: { item: "other" } },
  room: { cat: "painting", answers: { scope: "room" } },
  "whole-home": { cat: "painting", answers: { scope: "home" } },
  // No shop-front size in the form: the customer picks the closest one.
  "shop-front": { cat: "painting", answers: {} },
  "touch-up": { cat: "painting", answers: { scope: "wall" } },
  "deep-clean": { cat: "cleaning", answers: { type: "deep" } },
  "regular-clean": { cat: "cleaning", answers: { type: "home" } },
  "after-work": { cat: "cleaning", answers: { type: "post_construction" } },
  "garden-care": { cat: "landscaping", answers: {} },
  "tree-trimming": { cat: "landscaping", answers: {} },
  "pest-control": { cat: "cleaning", answers: {} },
};

export const EMERGENCY_PROBLEMS = [
  "leak",
  "blocked-toilet",
  "locked-out",
  "broken-door-window",
  "no-power",
  "damaged-roof",
  "no-hot-water",
] as const;

export const CATEGORY_PROBLEMS: Record<string, string[]> = {
  plumbing: ["leak", "blocked-drain", "tap-toilet", "water-pump", "water-tank", "water-heater"],
  electrical: ["no-light-power", "socket-switch", "breaker", "generator-inverter", "fan-light"],
  ac: ["ac-not-cooling", "ac-leak", "ac-noise", "ac-cleaning", "ac-install"],
  appliance: ["fridge", "washer", "oven", "dishwasher"],
  carpentry: ["door-lock", "wardrobe", "furniture", "carpentry-other"],
  painting: ["room", "whole-home", "shop-front", "touch-up"],
  cleaning: ["deep-clean", "regular-clean", "after-work", "pest-control"],
  landscaping: ["garden-care", "tree-trimming"],
};

/** Booking form link for one problem, pre-filled; emergencies ask for priority dispatch. */
export function bookingHref(problem: string, { emergency = false } = {}) {
  const map = PROBLEM_MAP[problem];
  const params = new URLSearchParams({ cat: map?.cat ?? "plumbing" });
  if (map && Object.keys(map.answers).length) params.set("ans", JSON.stringify(map.answers));
  if (emergency) params.set("priority", "1");
  return `/book?${params.toString()}`;
}

