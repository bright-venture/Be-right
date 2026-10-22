// Technicians' availability, like a ride app's "Go online": while Available, the app sends
// the technician's position (screen locked too, with a notification in the phone app), and
// suggested prices count travel from where they are. Offline, no position is kept.

/** Available but no position for this long (app closed, phone off): counted as offline. */
export const ONLINE_TIMEOUT_MINUTES = 120;

/** While Available, the app sends the position at most this often (and when standing still). */
export const PING_SECONDS = 60;

export type Presence = { availableSince: Date | null; updatedAt: Date };

export function isOnline(presence: Presence | null | undefined, now = Date.now()) {
  return (
    !!presence?.availableSince && now - new Date(presence.updatedAt).getTime() < ONLINE_TIMEOUT_MINUTES * 60_000
  );
}
