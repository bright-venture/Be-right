import { Navigate, useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { QueueTab } from "@/components/dashboard/QueueTab";
import { TechniciansTab } from "@/components/dashboard/TechniciansTab";
import { EmergenciesTab } from "@/components/dashboard/EmergenciesTab";
import { inView } from "@/components/dashboard/queueMeta";
import { useI18n } from "@/i18n";
import { useRoleGate } from "@/hooks/useRoleGate";
import { useAuth } from "@/hooks/useAuth";
import { useTabParam } from "@/hooks/useTabParam";
import { StaffGate } from "@/components/admin/StaffGate";
import { useLiveQueue } from "@/components/dashboard/useLiveQueue";
import { trpc } from "@/providers/trpc";

// Applications are reviewed by admins only (in /admin); specialists see the technicians.
const TABS = ["queue", "emergencies", "technicians"] as const;
type Tab = (typeof TABS)[number];

/** Specialist control center: requests queue, emergencies, technicians. */
export default function Dashboard() {
  const { t, p } = useI18n();
  // Admins run the dashboard too.
  const { role, isLoading: authLoading } = useRoleGate(["specialist", "admin"], { requireSignIn: true });
  // Specialists only: admins have the same requests and technicians in their own area.
  const isSpecialist = role === "specialist";
  // The tab is in the address (?tab=applications), so reloading and Back keep it.
  const [tab, setTab] = useTabParam<Tab>(TABS);
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
  const queue = useLiveQueue(allowed);
  const technicians = trpc.tech.list.useQuery(undefined, { enabled: allowed });

  // An admin who lands here (old link, bookmark, an email) sees the same thing in /admin.
  if (role === "admin") return <Navigate to={`/admin?tab=${tab === "queue" ? "requests" : tab}`} replace />;

  if (authLoading || !isSpecialist) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Loader2 className="h-8 w-8 animate-spin text-navy" />
      </div>
    );
  }

  const badges: Record<Tab, number> = {
    queue: (queue.data ?? []).filter((x) => inView("needsAction", x.request)).length,
    // Emergency jobs still open (a technician is on the way or at work).
    emergencies: (queue.data ?? []).filter(
      (x) => x.request.emergency && x.request.status !== "completed" && x.request.status !== "cancelled",
    ).length,
    technicians: technicians.data?.length ?? 0,
  };
  const labels = {
    queue: t.dash3.tabQueue,
    emergencies: t.emergency.tab,
    technicians: t.dash3.tabTechnicians,
  };

  return (
    <StaffGate access={access} onSignOut={() => void otherAccount()}>
      <div className="flex min-h-screen flex-col bg-paper">
        <Navbar />
        <main className="staff-ui mx-auto w-full max-w-7xl flex-1 px-4 pb-20 pt-24 sm:px-6">
          <h1 className="font-display text-3xl font-black text-navy sm:text-4xl">{p(t.dash.title)}</h1>

          <div role="tablist" className="mt-6 inline-flex flex-wrap gap-1 rounded-xl border border-navy/12 bg-white p-1 shadow-[0_1px_2px_rgb(12_43_92/0.06)]">
            {TABS.map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
                  tab === k ? "bg-navy text-paper" : "text-navy/65 hover:bg-navy/5 hover:text-navy"
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

          {tab === "queue" && <QueueTab />}
          {tab === "emergencies" && <EmergenciesTab />}
          {tab === "technicians" && <TechniciansTab />}
        </main>
        <Footer />
      </div>
    </StaffGate>
  );
}
