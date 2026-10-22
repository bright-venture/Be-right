import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Loader2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useI18n } from "@/i18n";
import { useRoleGate } from "@/hooks/useRoleGate";
import { getPresence, goOnline, startJobLocation, stopJobLocation, usePresence } from "@/lib/presence";
import { useTrackingNotice } from "@/hooks/useTrackingNotice";
import { Availability } from "@/components/tech/Availability";
import { JobCard, JobView, type Sharing } from "@/components/tech/TechJob";
import { isTodo, jobStep, type Job } from "@/lib/techJob";
import { trpc } from "@/providers/trpc";
import { ACTIVE_JOB_STATUSES } from "@contracts/workflow";
import type { RequestStatus } from "@contracts/services";

/**
 * A job's live location for its customer, through the shared tracker (src/lib/presence.ts):
 * in the phone app it keeps going with the screen locked. Stops by itself once that job is no
 * longer active for this technician (completed, cancelled, reassigned).
 */
function useLocationSharing(activeJobIds: readonly number[] | undefined): Sharing {
  const presence = usePresence();
  const notice = useTrackingNotice();
  // The job the technician last tried to share: a problem shows on that job.
  const [triedFor, setTriedFor] = useState<number | null>(null);
  const sharingFor = presence.sharedJob;

  // The jobs list refreshes every minute and after each field action.
  const jobGone = sharingFor !== null && activeJobIds !== undefined && !activeJobIds.includes(sharingFor);
  useEffect(() => {
    if (jobGone) stopJobLocation();
  }, [jobGone]);

  // On my way: the customer sees them, and they go online if they weren't (one GPS for both).
  const start = async (requestId: number) => {
    setTriedFor(requestId);
    await startJobLocation(requestId, notice);
    const now = getPresence();
    if (!now.online && now.sharedJob === requestId) void goOnline(notice);
  };
  const stop = () => {
    setTriedFor(null);
    stopJobLocation();
  };
  const geoError = triedFor !== null && sharingFor === null && !!presence.problem;
  return { sharingFor: jobGone ? null : sharingFor, geoError, start: (id) => void start(id), stop };
}

/** Jobs to do: under way first, then the next appointments; done: newest first. */
function order(jobs: Job[], todo: boolean) {
  const rank = (j: Job) => {
    const step = jobStep(j);
    return step === 3 ? 0 : step === 2 ? 1 : step === 1 ? 2 : 3;
  };
  return [...jobs].sort((a, b) =>
    todo ? rank(a) - rank(b) || a.preferredDate.localeCompare(b.preferredDate) : b.id - a.id,
  );
}

/**
 * My jobs, for technicians: Available or offline on top, then the jobs in two tabs (To do,
 * Done). Opening one shows its steps, what to do now, and its details. The open job is in the
 * address (?job=12), so the phone's Back button returns to the list.
 */
export default function Tech() {
  const { t, p } = useI18n();
  const { role, isLoading: authLoading } = useRoleGate(["technician"], { requireSignIn: true });
  const isTech = role === "technician";
  const [params, setParams] = useSearchParams();

  const jobs = trpc.tech.myJobs.useQuery(undefined, { enabled: !!isTech, refetchInterval: 60_000 });
  const activeJobIds = useMemo(
    () => jobs.data?.filter((j) => ACTIVE_JOB_STATUSES.includes(j.status as RequestStatus)).map((j) => j.id),
    [jobs.data],
  );
  const sharing = useLocationSharing(activeJobIds);
  const [tab, setTab] = useState<"todo" | "done">("todo");

  if (authLoading || !isTech) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Loader2 className="h-8 w-8 animate-spin text-navy" />
      </div>
    );
  }

  const rows = jobs.data ?? [];
  const todo = order(rows.filter(isTodo), true);
  const done = order(rows.filter((j) => !isTodo(j)), false);
  const openId = Number(params.get("job"));
  const open = rows.find((j) => j.id === openId);
  const openJob = (id: number) => {
    setParams({ job: String(id) });
    window.scrollTo({ top: 0 });
  };
  const shown = tab === "todo" ? todo : done;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Navbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-20 pt-24 sm:px-6">
        {open ? (
          <JobView
            key={open.id}
            job={open}
            sharing={sharing}
            onBack={() => {
              setTab(isTodo(open) ? "todo" : "done");
              setParams({});
            }}
          />
        ) : (
          <>
            <h1 className="font-display text-3xl font-black text-navy sm:text-4xl">{p(t.tech.title)}</h1>
            <Availability />

            <div role="tablist" className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-navy/12 bg-white p-1">
              {(
                [
                  ["todo", t.tech.tabTodo, todo.length],
                  ["done", t.tech.tabDone, done.length],
                ] as const
              ).map(([id, label, n]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-bold transition-colors ${
                    tab === id ? "bg-navy text-paper" : "text-navy/65 hover:bg-navy/5"
                  }`}
                >
                  {p(label)}
                  <span
                    className={`rounded-full px-2 py-px text-[11px] font-black ${
                      tab === id ? "bg-paper text-navy" : id === "todo" && n > 0 ? "bg-flame text-white" : "bg-navy/10 text-navy/60"
                    }`}
                  >
                    {n}
                  </span>
                </button>
              ))}
            </div>

            <div role="tabpanel" className="mt-4 flex flex-col gap-3">
              {jobs.isLoading ? (
                <Loader2 className="mx-auto mt-6 h-6 w-6 animate-spin text-navy" />
              ) : shown.length === 0 ? (
                <div className="card-br p-8 text-center text-sm font-semibold text-navy/65">
                  {p(tab === "todo" ? t.tech.emptyTodo : t.tech.emptyDone)}
                </div>
              ) : (
                shown.map((j) => <JobCard key={j.id} job={j} sharing={sharing.sharingFor === j.id} onOpen={() => openJob(j.id)} />)
              )}
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
