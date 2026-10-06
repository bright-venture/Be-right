import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import superjson from "superjson";
import type { AppRouter } from "../../server/router";
import { useEffect, type ReactNode } from "react";
import { AUTH_CHANGED_EVENT, mightBeSignedIn } from "@/lib/session";
import { apiUrl } from "@/lib/native";

const loadSupabase = () => import("@/lib/supabase");

export const trpc = createTRPCReact<AppRouter>();

const queryClient = new QueryClient();
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
