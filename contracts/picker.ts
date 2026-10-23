// The home page's service picker: which problems it offers, and how each one pre-fills
// the booking form (src/components/CategoryPicker.tsx → /book?cat=…&ans=…).

export const PROBLEM_MAP: Record<string, { cat: string; answers: Record<string, string> }> = {
  leak: { cat: "plumbing", answers: { problem: "leak" } },
  "locked-out": { cat: "locksmith", answers: { need: "home_lockout" } },
  "blocked-drain": { cat: "plumbing", answers: { problem: "blocked" } },
  "tap-toilet": { cat: "plumbing", answers: { problem: "fixture" } },
  "water-pump": { cat: "plumbing", answers: { problem: "pump" } },
  "water-tank": { cat: "plumbing", answers: { problem: "leak", location: "tank" } },
  "tank-filter": { cat: "plumbing", answers: { problem: "tank_filter" } },
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
  "roof-leak": { cat: "waterproofing", answers: { area: "roof", state: "leaking" } },
  "damp-walls": { cat: "waterproofing", answers: { area: "walls" } },
  "bathroom-waterproofing": { cat: "waterproofing", answers: { area: "bathroom" } },
  "tank-waterproofing": { cat: "waterproofing", answers: { area: "tank" } },
  "furniture-assembly": { cat: "installation", answers: { item: "furniture" } },
  "tv-mounting": { cat: "installation", answers: { item: "tv" } },
  "curtains-blinds": { cat: "installation", answers: { item: "curtains" } },
  "shelves-mirrors": { cat: "installation", answers: { item: "shelves" } },
  "car-lockout": { cat: "locksmith", answers: { need: "car_lockout" } },
  "lock-change": { cat: "locksmith", answers: { need: "lock_change" } },
  "key-copy": { cat: "locksmith", answers: { need: "key_copy" } },
  "car-key": { cat: "locksmith", answers: { need: "car_key" } },
  "cctv-install": { cat: "cameras", answers: { system: "cameras", need: "install" } },
  "cctv-repair": { cat: "cameras", answers: { system: "cameras", need: "repair" } },
  "alarm-system": { cat: "cameras", answers: { system: "alarm" } },
  intercom: { cat: "cameras", answers: { system: "intercom" } },
};

export const CATEGORY_PROBLEMS: Record<string, string[]> = {
  plumbing: ["leak", "blocked-drain", "tap-toilet", "water-pump", "water-tank", "tank-filter", "water-heater"],
  electrical: ["no-light-power", "socket-switch", "breaker", "generator-inverter", "fan-light"],
  ac: ["ac-not-cooling", "ac-leak", "ac-noise", "ac-cleaning", "ac-install"],
  carpentry: ["door-lock", "wardrobe", "furniture", "carpentry-other"],
  painting: ["room", "whole-home", "shop-front", "touch-up"],
  waterproofing: ["roof-leak", "damp-walls", "bathroom-waterproofing", "tank-waterproofing"],
  installation: ["furniture-assembly", "tv-mounting", "curtains-blinds", "shelves-mirrors"],
  locksmith: ["locked-out", "car-lockout", "lock-change", "key-copy", "car-key"],
  cameras: ["cctv-install", "cctv-repair", "alarm-system", "intercom"],
  cleaning: ["deep-clean", "regular-clean", "after-work"],
  landscaping: ["garden-care", "tree-trimming"],
};

/** Booking form link for one problem, pre-filled. */
export function bookingHref(problem: string) {
  const map = PROBLEM_MAP[problem];
  const params = new URLSearchParams({ cat: map?.cat ?? "plumbing" });
  if (map && Object.keys(map.answers).length) params.set("ans", JSON.stringify(map.answers));
  return `/book?${params.toString()}`;
}

