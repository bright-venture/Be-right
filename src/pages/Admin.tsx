import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ApplicationsTab } from "@/components/dashboard/ApplicationsTab";
import { QueueTab } from "@/components/dashboard/QueueTab";
import { TechniciansTab } from "@/components/dashboard/TechniciansTab";
import { ActivityTab, CustomersTab, OverviewTab, TeamTab } from "@/components/admin/AdminTabs";
import { useI18n } from "@/i18n";
import { useRoleGate } from "@/hooks/useRoleGate";
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
  const { role, isLoading } = useRoleGate(["admin"], { requireSignIn: true });
  const isAdmin = role === "admin";
  const [tab, setTab] = useState<Tab>("overview");
  const applications = trpc.join.list.useQuery(undefined, { enabled: isAdmin });

  if (isLoading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Loader2 className="h-8 w-8 animate-spin text-navy" />
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
