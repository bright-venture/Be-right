import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import superjson from "superjson";
import type { AppRouter } from "../../server/router";
import { useEffect, type ReactNode } from "react";
import { AUTH_CHANGED_EVENT, mightBeSignedIn } from "@/lib/session";
import { apiUrl } from "@/lib/native";
import { STAFF_PASSWORD_REQUIRED, STAFF_TWO_STEP_REQUIRED } from "@contracts/roles";

const loadSupabase = () => import("@/lib/supabase");

export const trpc = createTRPCReact<AppRouter>();

/** The staff areas' "can I come in?" queries (see src/components/admin/StaffGate.tsx). */
type Keyed = { queryKey: readonly unknown[] };
const isStaffAccess = (query: Keyed) => {
  const path = query.queryKey[0];
  return Array.isArray(path) && path[1] === "access" && (path[0] === "admin" || path[0] === "specialist");
};

/**
 * A staff session can lose its password or two-step sign-in while a staff page is open
 * (another sign-in in this browser shares the session). Any request refused for that reason
 * asks the staff gate to check again, so it shows the sign-in or code screen instead of the
 * error inside a tab.
 */
const isStaffRefusal = (error: unknown) => {
  const message = (error as { message?: string } | null)?.message;
  return message === STAFF_TWO_STEP_REQUIRED || message === STAFF_PASSWORD_REQUIRED;
};

const recheckStaffAccess = (error: unknown, query?: Keyed) => {
  if (!isStaffRefusal(error)) return;
  if (query && isStaffAccess(query)) return; // the gate already shows this one
  void queryClient.resetQueries({ predicate: isStaffAccess });
};

const queryClient: QueryClient = new QueryClient({
  // A refusal for the sign-in won't change on retry: show the right screen at once.
  defaultOptions: { queries: { retry: (failures, error) => !isStaffRefusal(error) && failures < 3 } },
  queryCache: new QueryCache({ onError: (error, query) => recheckStaffAccess(error, query) }),
  mutationCache: new MutationCache({ onError: (error) => recheckStaffAccess(error) }),
});
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: apiUrl("/api/trpc"),
      transformer: superjson,
      async headers() {
        // Visitors who never signed in skip loading Supabase just to find no token.
        if (!mightBeSignedIn()) return {};
        const token = await (await loadSupabase()).getAccessToken();
        return token ? { authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

export function TRPCProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Refetch everything when the signed-in identity changes (see src/lib/supabase.ts).
    const refetch = () => void queryClient.invalidateQueries();
    window.addEventListener(AUTH_CHANGED_EVENT, refetch);
    // A stored session may need refreshing, and an email link's tokens need reading.
    if (mightBeSignedIn()) void loadSupabase();
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, refetch);
  }, []);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
