import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ApplicationsTab } from "@/components/dashboard/ApplicationsTab";
import { QueueTab } from "@/components/dashboard/QueueTab";
import { TechniciansTab } from "@/components/dashboard/TechniciansTab";
import { ActivityTab, CustomersTab, OverviewTab, TeamTab } from "@/components/admin/AdminTabs";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { AuthPanel } from "@/components/AuthPanel";
import { ADMIN_PASSWORD_REQUIRED, ADMIN_TWO_STEP_REQUIRED, HOME_BY_ROLE, type Role } from "@contracts/roles";
import { AdminTwoStep } from "@/components/admin/AdminTwoStep";
import { trpc } from "@/providers/trpc";

const TABS = ["overview", "requests", "customers", "applications", "technicians", "team", "activity"] as const;
type Tab = (typeof TABS)[number];

/**
 * The admin area: figures, every request, customer, application, technician and team
 * member, and the activity log. Requests, applications and technicians are the same
 * screens as the specialist dashboard, so admins can act on them right here.
 */
export default function Admin() {
  const { t, p } = useI18n();
  // No redirects: /admin is its own door. Signed out, it shows the admin sign-in here.
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  // Switching accounts stays here, on the admin sign-in (signing out normally goes home).
  const otherAccount = async () => {
    await logout();
    navigate("/admin", { replace: true });
  };
  const role = user?.role as Role | undefined;
  const isAdmin = role === "admin";
  const [tab, setTab] = useState<Tab>("overview");
  const utils = trpc.useUtils();
  // The server decides whether this session may use the admin area: a password sign-in,
  // then two-step login (authenticator app). Nothing else loads until it says yes.
  const access = trpc.admin.access.useQuery(undefined, { enabled: isAdmin, retry: false });
  const allowed = !!access.data;
  const needsPassword = access.error?.message === ADMIN_PASSWORD_REQUIRED;
  const needsTwoStep = access.error?.message === ADMIN_TWO_STEP_REQUIRED;
  const applications = trpc.join.list.useQuery(undefined, { enabled: allowed });

  if (isLoading || (isAdmin && access.isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Loader2 className="h-8 w-8 animate-spin text-navy" />
      </div>
    );
  }

  if (isAdmin && needsTwoStep) {
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-4 py-24">
          {/* Verified: the session is now a two-step one, so ask again (and reload everything). */}
          <AdminTwoStep onDone={() => void utils.invalidate()} onSignOut={() => void otherAccount()} />
        </main>
        <Footer />
      </div>
    );
  }

  if (isAdmin && access.error && !needsPassword) {
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        <Navbar />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
          <p role="alert" className="text-sm font-semibold text-destructive">
            {access.error.message}
          </p>
          <button type="button" onClick={() => void access.refetch()} className="btn-pill-outline !min-h-10 text-sm">
            {p(t.admin.retry)}
          </button>
        </main>
        <Footer />
      </div>
    );
  }

  if (isAdmin && needsPassword) {
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-4 py-24">
          <div className="card-br flex w-full max-w-md flex-col gap-4 !rounded-[28px] p-6 sm:p-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy text-white">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <h1 className="font-display text-2xl font-black text-navy">{p(t.admin.signInTitle)}</h1>
            <p className="text-sm leading-relaxed text-navy/70">{p(t.admin.passwordNeeded)}</p>
            <p className="text-xs leading-relaxed text-navy/60">{p(t.admin.passwordHint)}</p>
            <button type="button" onClick={() => void otherAccount()} className="btn-pill-primary !min-h-11 justify-center text-sm">
              {p(t.admin.signInWithPassword)}
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col bg-paper">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-4 py-24">
          <div className="card-br w-full max-w-md !rounded-[28px] p-6 sm:p-8">
            <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-navy text-white">
              <ShieldCheck className="h-6 w-6" />
            </span>
            {!user ? (
              <AuthPanel
                next="/admin"
                headingLevel="h1"
                staff={{ title: p(t.admin.signInTitle), sub: p(t.admin.signInSub) }}
              />
            ) : (
              <div className="flex flex-col gap-4">
                <h1 className="font-display text-2xl font-black text-navy">{p(t.admin.signInTitle)}</h1>
                <p className="text-sm leading-relaxed text-navy/70">
                  {p(t.admin.notAdmin).replace("{email}", user.email ?? "")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Link to={role ? HOME_BY_ROLE[role] : "/"} className="btn-pill-outline !min-h-11 justify-center text-sm">
                    {p(t.admin.goToMine)}
                  </Link>
                  <button type="button" onClick={() => void otherAccount()} className="btn-pill-primary !min-h-11 justify-center text-sm">
                    {p(t.admin.otherAccount)}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const newApplications = (applications.data ?? []).filter((a) => a.status === "new").length;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-20 pt-24 sm:px-6">
        <h1 className="font-display text-3xl font-black text-navy sm:text-4xl">{p(t.admin.title)}</h1>
        <p className="mt-1 text-sm text-navy/60">{p(t.admin.sub)}</p>

        {/* tabs: one row that scrolls sideways on phones */}
        <div className="-mx-4 mt-6 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
          <div role="tablist" className="inline-flex gap-1 rounded-3xl border-2 border-navy bg-white p-1">
            {TABS.map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-bold transition-colors ${
                  tab === k ? "bg-navy text-paper" : "text-navy/70 hover:text-navy"
                }`}
              >
                {p(t.admin.tabs[k])}
                {k === "applications" && newApplications > 0 && (
                  <span className={`rounded-full px-2 py-px text-[11px] font-black ${tab === k ? "bg-paper text-navy" : "bg-flame text-white"}`}>
                    {newApplications}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {tab === "overview" && <OverviewTab />}
        {tab === "requests" && <QueueTab onGoToApplications={() => setTab("applications")} />}
        {tab === "customers" && <CustomersTab />}
        {tab === "applications" && <ApplicationsTab />}
        {tab === "technicians" && <TechniciansTab onGoToApplications={() => setTab("applications")} />}
        {tab === "team" && <TeamTab />}
        {tab === "activity" && <ActivityTab />}
      </main>
      <Footer />
    </div>
  );
}
