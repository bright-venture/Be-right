import { useCallback, useState } from "react";
import { ConfirmDialog, type ConfirmOptions } from "@/components/ConfirmDialog";

/**
 * `const [confirm, confirmDialog] = useConfirm();` then render `{confirmDialog}` and
 * `if (await confirm({ title, confirmLabel })) …`.
 */
export function useConfirm() {
  const [asking, setAsking] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setAsking({ ...options, resolve })), []);
  const answer = useCallback(
    (ok: boolean) => {
      asking?.resolve(ok);
      setAsking(null);
    },
    [asking],
  );
  const dialog = asking ? <ConfirmDialog {...asking} onAnswer={answer} /> : null;
  return [confirm, dialog] as const;
}
