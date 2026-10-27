import { trpc } from "@/providers/trpc";
import { CATEGORIES } from "@contracts/services";

/**
 * The services this staff member handles: a specialist's own (each service has one
 * specialist), or every service for admins (`all`). Shares the dashboard's access check.
 */
export function useMyServices() {
  const access = trpc.specialist.access.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const mine = access.data?.services ?? null;
  return {
    /** null: an admin, who handles every service (and Other). */
    mine,
    /** The services to offer in lists (filters, the emergency form). */
    categories: mine ? CATEGORIES.filter((c) => mine.includes(c.id)) : CATEGORIES,
  };
}
