// Notification emails (and push): who hears about what, in English and Arabic.
// Called by the routers after a change has been saved. A failed email is logged and
// never undoes or blocks the change itself. The events live by area in the files next to this one.

import { requestNotifications } from "./requests";
import { teamNotifications } from "./team";
import { emergencyNotifications } from "./emergencies";

/* ---------- notifications ---------- */

export const notify = {
  ...requestNotifications,
  ...teamNotifications,
  ...emergencyNotifications,
};
