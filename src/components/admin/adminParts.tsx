// Pieces the admin tabs share: card styles, the loading/failed state, "Load more".

import { Loader2 } from "lucide-react";
import { useI18n } from "@/i18n";

export const CARD = "rounded-3xl border border-navy/10 bg-white p-5";

export const H2 = "font-display text-lg font-extrabold text-navy";

/** Still loading, or it failed: then say why and offer to try again (never an endless spinner). */
export function Pending({ error, retry }: { error?: { message: string } | null; retry?: () => void }) {
  const { t, p } = useI18n();
  if (error) {
    return (
      <div role="alert" className="mt-8 flex flex-col items-center gap-3 rounded-3xl border border-destructive/30 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-destructive">
          {/fetch|network/i.test(error.message) ? p(t.misc.offline) : error.message}
        </p>
        {retry && (
          <button type="button" onClick={retry} className="btn-pill-outline !min-h-10 !px-5 text-sm">
            {p(t.admin.retry)}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-7 w-7 animate-spin text-navy" />
    </div>
  );
}

/** "Show more" under a list loaded a page at a time. */
export function LoadMore({ list }: { list: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
  const { t, p } = useI18n();
  if (!list.hasNextPage) return null;
  return (
    <button
      type="button"
      onClick={() => void list.fetchNextPage()}
      disabled={list.isFetchingNextPage}
      className="btn-pill-outline mx-auto mt-4 !min-h-10 !px-6 text-sm disabled:opacity-50"
    >
      {list.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
      {p(t.admin.loadMore)}
    </button>
  );
}
