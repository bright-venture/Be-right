import { Link, useNavigate } from "react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ApplicationsTab } from "@/components/dashboard/ApplicationsTab";
import { QueueTab } from "@/components/dashboard/QueueTab";
import { EmergenciesTab, EMERGENCY_REFRESH_MS } from "@/components/dashboard/EmergenciesTab";
import { TechniciansTab } from "@/components/dashboard/TechniciansTab";
import { ActivityTab, CustomersTab, OverviewTab, TeamTab } from "@/components/admin/AdminTabs";
import { PartsShopsTab } from "@/components/admin/PartsShopsTab";
import { useI18n } from "@/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useTabParam } from "@/hooks/useTabParam";
import { AuthPanel } from "@/components/AuthPanel";
import { HOME_BY_ROLE, type Role } from "@contracts/roles";
import { StaffGate } from "@/components/admin/StaffGate";
import { SectionMenu } from "@/components/admin/SectionMenu";
import { trpc } from "@/providers/trpc";

const TABS = ["overview", "requests", "emergencies", "customers", "applications", "technicians", "parts", "team", "activity"] as const;
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
  // The tab is in the address (?tab=team), so reloading and Back keep it.
  const [tab, setTab] = useTabParam<Tab>(TABS);
  // The server decides whether this session may use the admin area: a password sign-in,
  // then two-step login (authenticator app). Nothing else loads until it says yes.
  const access = trpc.admin.access.useQuery(undefined, { enabled: isAdmin, retry: false });
  const allowed = !!access.data;
  const applications = trpc.join.list.useQuery(undefined, { enabled: allowed });
  const waiting = trpc.emergency.waiting.useQuery(undefined, { enabled: allowed, refetchInterval: EMERGENCY_REFRESH_MS });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Loader2 className="h-8 w-8 animate-spin text-navy" />
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

  // Waiting for an admin's approval (step 1 of the review).
  const newApplications = (applications.data ?? []).filter(
    (a) => !a.approvedAt && (a.status === "new" || a.status === "contacted"),
  ).length;
  const badgeOf = (k: Tab) => (k === "applications" ? newApplications : k === "emergencies" ? (waiting.data?.length ?? 0) : 0);

  return (
    <StaffGate access={access} onSignOut={() => void otherAccount()}>
      <div className="flex min-h-screen flex-col bg-paper">
        <Navbar />
        <main className="staff-ui mx-auto w-full max-w-7xl flex-1 px-4 pb-20 pt-24 sm:px-6">
          <h1 className="font-display text-3xl font-black text-navy sm:text-4xl">{p(t.admin.title)}</h1>
          <p className="mt-1 text-sm text-navy/60">{p(t.admin.sub)}</p>

          {/* Phones and tablets: the 9 sections don't fit in a row, so one clear menu. */}
          <div className="mt-6 lg:hidden">
            <SectionMenu
              label={p(t.admin.sectionLabel)}
              value={tab}
              onChange={setTab}
              options={TABS.map((k) => ({
                value: k,
                label: p(t.admin.tabs[k]),
                badge: badgeOf(k) || undefined,
              }))}
            />
          </div>

          {/* PC: every section as a tab, in one row across the full width. */}
          <div className="mt-6 hidden lg:block">
            <div role="tablist" className="flex w-full gap-1 rounded-xl border border-navy/12 bg-white p-1 shadow-[0_1px_2px_rgb(12_43_92/0.06)]">
              {TABS.map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={`inline-flex h-9 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition-colors ${
                    tab === k ? "bg-navy text-paper" : "text-navy/65 hover:bg-navy/5 hover:text-navy"
                  }`}
                >
                  {p(t.admin.tabs[k])}
                  {badgeOf(k) > 0 && (
                    <span className={`rounded-full px-2 py-px text-[11px] font-black ${tab === k ? "bg-paper text-navy" : "bg-flame text-white"}`}>
                      {badgeOf(k)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {tab === "overview" && <OverviewTab onOpen={setTab} />}
          {tab === "requests" && <QueueTab onGoToApplications={() => setTab("applications")} />}
          {tab === "emergencies" && <EmergenciesTab />}
          {tab === "customers" && <CustomersTab />}
          {tab === "applications" && <ApplicationsTab />}
          {tab === "technicians" && <TechniciansTab onGoToApplications={() => setTab("applications")} />}
          {tab === "team" && <TeamTab />}
          {tab === "parts" && <PartsShopsTab />}
          {tab === "activity" && <ActivityTab />}
        </main>
        <Footer />
      </div>
    </StaffGate>
  );
}
