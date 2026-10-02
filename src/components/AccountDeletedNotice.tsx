import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/i18n";
import { ACCOUNT_DELETED_FLAG } from "@/lib/session";

/** One-time confirmation after a customer deleted their account (src/pages/Account.tsx). */
export function AccountDeletedNotice() {
  const { t, p } = useI18n();
  const [show, setShow] = useState(() => {
    try {
      return sessionStorage.getItem(ACCOUNT_DELETED_FLAG) === "1";
    } catch {
      return false;
    }
  });
  // Shown once: forget the flag after it's displayed.
  useEffect(() => {
    try {
      sessionStorage.removeItem(ACCOUNT_DELETED_FLAG);
    } catch {
      // nothing to clean up
    }
  }, []);
  if (!show) return null;
  return (
    <div role="status" className="fixed inset-x-4 top-20 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border-2 border-navy bg-white p-4 shadow-lg">
      <p className="flex-1 text-sm font-semibold text-navy">{p(t.account.deleted)}</p>
      <button onClick={() => setShow(false)} aria-label="OK" className="text-navy/70 hover:text-navy">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
