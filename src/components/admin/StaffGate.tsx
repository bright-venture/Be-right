import type { ReactNode } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { AdminTwoStep } from "@/components/admin/AdminTwoStep";
import { useI18n } from "@/i18n";
import { trpc } from "@/providers/trpc";
import { STAFF_PASSWORD_REQUIRED, STAFF_TWO_STEP_REQUIRED } from "@contracts/roles";

type Access = {
  data?: unknown;
  error: { message: string } | null;
  isLoading: boolean;
  refetch: () => unknown;
};

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24">{children}</main>
      <Footer />
    </div>
  );
}

/**
 * Staff areas (the dashboard, /admin) show their content only once the server accepts the
 * session: a password sign-in, then two-step login (authenticator app). Until then this shows
 * the step that's missing. `access` is the area's own "can I come in?" query.
 */
export function StaffGate({ access, onSignOut, children }: { access: Access; onSignOut: () => void; children: ReactNode }) {
  const { t, p } = useI18n();
  const utils = trpc.useUtils();

  if (access.data) return <>{children}</>;

  if (access.error?.message === STAFF_TWO_STEP_REQUIRED) {
    return (
      <Screen>
        {/* Verified: the session is now a two-step one, so ask again (and reload everything). */}
        <AdminTwoStep onDone={() => void utils.invalidate()} onSignOut={onSignOut} />
      </Screen>
    );
  }

  if (access.error?.message === STAFF_PASSWORD_REQUIRED) {
    return (
      <Screen>
        <div className="card-br flex w-full max-w-md flex-col gap-4 !rounded-[28px] p-6 sm:p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy text-white">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <h1 className="font-display text-2xl font-black text-navy">{p(t.admin.passwordTitle)}</h1>
          <p className="text-sm leading-relaxed text-navy/70">{p(t.admin.passwordNeeded)}</p>
          <p className="text-xs leading-relaxed text-navy/60">{p(t.admin.passwordHint)}</p>
          <button type="button" onClick={onSignOut} className="btn-pill-primary !min-h-11 justify-center text-sm">
            {p(t.admin.signInWithPassword)}
          </button>
        </div>
      </Screen>
    );
  }

  if (access.error) {
    return (
      <Screen>
        <p role="alert" className="text-center text-sm font-semibold text-destructive">
          {/fetch|network/i.test(access.error.message) ? p(t.misc.offline) : access.error.message}
        </p>
        <button type="button" onClick={() => void access.refetch()} className="btn-pill-outline !min-h-10 text-sm">
          {p(t.admin.retry)}
        </button>
      </Screen>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <Loader2 className="h-8 w-8 animate-spin text-navy" />
    </div>
  );
}
