// Map pins and directions. Be Right takes bookings anywhere: the team confirms per request
// that someone can come.

/** A real point on the map (0, 0 in the ocean means "never set"). */
export function isValidPin(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** Before the customer's location is known, the map shows the whole world. */
export const WORLD_VIEW = { lat: 20, lng: 0, zoom: 2 } as const;

/** Turn-by-turn directions in the apps technicians use. */
export function directionsLinks(lat: number, lng: number) {
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  };
}
