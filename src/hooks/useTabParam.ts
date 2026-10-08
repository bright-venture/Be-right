import { useCallback } from "react";
import { useSearchParams } from "react-router";

/**
 * A screen's current tab, kept in the address (?tab=team): reloading stays on it, Back goes
 * to the previous tab, and a tab can be linked to. The first tab leaves the address clean.
 */
export function useTabParam<T extends string>(tabs: readonly T[], fallback: T = tabs[0]) {
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab");
  const tab = asked && (tabs as readonly string[]).includes(asked) ? (asked as T) : fallback;
  const setTab = useCallback(
    (next: T) =>
      setParams((current) => {
        const updated = new URLSearchParams(current);
        if (next === fallback) updated.delete("tab");
        else updated.set("tab", next);
        return updated;
      }),
    [setParams, fallback],
  );
  return [tab, setTab] as const;
}
