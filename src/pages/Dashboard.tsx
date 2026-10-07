import { useState } from "react";
import { useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ApplicationsTab } from "@/components/dashboard/ApplicationsTab";
import { QueueTab } from "@/components/dashboard/QueueTab";
import { TechniciansTab } from "@/components/dashboard/TechniciansTab";
import { inView } from "@/components/dashboard/queueMeta";
import { useI18n } from "@/i18n";
import { useRoleGate } from "@/hooks/useRoleGate";
import { useAuth } from "@/hooks/useAuth";
import { StaffGate } from "@/components/admin/StaffGate";
import { trpc } from "@/providers/trpc";
import { canDispatch } from "@contracts/roles";

type Tab = "queue" | "applications" | "technicians";

/** Specialist control center: requests queue, technician applications, technicians. */
export default function Dashboard() {
  const { t, p } = useI18n();
  // Admins run the dashboard too.
  const { role, isLoading: authLoading } = useRoleGate(["specialist", "admin"], { requireSignIn: true });
  const isSpecialist = canDispatch(role);
  const [tab, setTab] = useState<Tab>("queue");
  const { logout } = useAuth();
  const navigate = useNavigate();
  // Signing in again (with a password) comes back here.
  const otherAccount = async () => {
    await logout();
    navigate("/login?next=/dashboard", { replace: true });
  };
  // Like /admin: a password sign-in plus two-step login, or nothing else loads.
  const access = trpc.specialist.access.useQuery(undefined, { enabled: isSpecialist, retry: false });
  const allowed = !!access.data;

  // Badge counts (same queries the tabs use, so they share the cache).
  const queue = trpc.specialist.queue.useQuery(undefined, { enabled: allowed, refetchInterval: 30_000 });
  const applications = trpc.join.list.useQuery(undefined, { enabled: allowed });
  const technicians = trpc.tech.list.useQuery(undefined, { enabled: allowed });

  if (authLoading || !isSpecialist) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Loader2 className="h-8 w-8 animate-spin text-navy" />
      </div>
    );
  }

  const badges: Record<Tab, number> = {
    queue: (queue.data ?? []).filter((x) => inView("needsAction", x.request)).length,
    applications: (applications.data ?? []).filter((a) => a.status === "new").length,
    technicians: technicians.data?.length ?? 0,
  };
  const labels = {
    queue: t.dash3.tabQueue,
    applications: t.dash3.tabApplications,
    technicians: t.dash3.tabTechnicians,
  };
  const goToApplications = () => setTab("applications");

  return (
    <StaffGate access={access} onSignOut={() => void otherAccount()}>
      <div className="flex min-h-screen flex-col bg-paper">
        <Navbar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-20 pt-24 sm:px-6">
          <h1 className="font-display text-3xl font-black text-navy sm:text-4xl">{p(t.dash.title)}</h1>

          <div role="tablist" className="mt-6 inline-flex flex-wrap gap-1 rounded-3xl border-2 border-navy bg-white p-1">
            {(["queue", "applications", "technicians"] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-full px-5 text-sm font-bold transition-colors ${
                  tab === k ? "bg-navy text-paper" : "text-navy/70 hover:text-navy"
                }`}
              >
                {p(labels[k])}
                {badges[k] > 0 && (
                  <span
                    className={`rounded-full px-2 py-px text-[11px] font-black ${
                      tab === k ? "bg-paper text-navy" : k === "technicians" ? "bg-navy/10 text-navy" : "bg-flame-ink text-white"
                    }`}
                  >
                    {badges[k]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === "queue" && <QueueTab onGoToApplications={goToApplications} />}
          {tab === "applications" && <ApplicationsTab />}
          {tab === "technicians" && <TechniciansTab onGoToApplications={goToApplications} />}
        </main>
        <Footer />
      </div>
    </StaffGate>
  );
}
