// The three kinds of account and where each one lives in the app.
//   customer   — books services, follows and approves their requests
//   technician — works the jobs a specialist assigns to them
//   specialist — office staff: reviews, quotes, dispatches, manages technicians
//   admin      — owners/managers: everything a specialist does, plus the admin area (/admin):
//                every customer, the team (specialists and admins), activity and figures

export const ROLES = ["customer", "technician", "specialist", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Each role's own area. Staff are sent here after signing in. */
export const HOME_BY_ROLE: Record<Role, string> = {
  customer: "/requests",
  technician: "/tech",
  specialist: "/dashboard",
  admin: "/admin",
};

/** Why the admin area refused a signed-in admin: the session didn't start with a password. */
export const ADMIN_PASSWORD_REQUIRED = "Sign in with your password to use the admin area.";

/** Can run the specialist dashboard (admins can do everything specialists can). */
export function canDispatch(role: Role | null | undefined) {
  return role === "specialist" || role === "admin";
}

export function isStaff(role: Role) {
  return role !== "customer";
}
