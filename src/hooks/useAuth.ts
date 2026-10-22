import { trpc } from "@/providers/trpc";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { LOGIN_PATH } from "@/const";
import { stopAllLocation } from "@/lib/presence";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = LOGIN_PATH } =
    options ?? {};

  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [signingOut, setSigningOut] = useState(false);

  const {
    data: user,
    isLoading,
    error,
    refetch,
  } = trpc.auth.me.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const logout = useCallback(async () => {
    setSigningOut(true);
    try {
      await stopAllLocation();
      const { supabase } = await import("@/lib/supabase");
      await supabase.auth.signOut();
      utils.auth.me.setData(undefined, null);
      await utils.invalidate();
      navigate("/");
    } finally {
      setSigningOut(false);
    }
  }, [navigate, utils]);

  useEffect(() => {
    if (redirectOnUnauthenticated && !isLoading && !user) {
      const currentPath = window.location.pathname;
      if (currentPath !== redirectPath) {
        const next = encodeURIComponent(currentPath + window.location.search);
        navigate(`${redirectPath}?next=${next}`);
      }
    }
  }, [redirectOnUnauthenticated, isLoading, user, navigate, redirectPath]);

  return useMemo(
    () => ({
      user: user ?? null,
      isAuthenticated: !!user,
      isLoading: isLoading || signingOut,
      error,
      logout,
      refresh: refetch,
    }),
    [user, isLoading, signingOut, error, logout, refetch],
  );
}
