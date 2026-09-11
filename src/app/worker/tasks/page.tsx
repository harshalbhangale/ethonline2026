"use client";

import Link from "next/link";
import { useWorker } from "@/components/worker/WorkerStore";
import JobCardSkeleton from "@/components/worker/Skeleton";
import {
  feeForWorker,
  formatMoney,
  statusLabel,
  type Job,
} from "@/lib/worker-data";

/** Needs me, then waiting on someone else, then finished. */
const priority: Record<string, number> = {
  NEEDS_RECAPTURE: 0,
  ACCEPTED: 1,
  CHECK_ACCEPTED: 1,
  AWAITING_CHECK: 2,
  IN_REVIEW: 3,
  VERIFIED: 4,
  REJECTED: 5,
  EXPIRED: 6,
};

/** The statuses where the worker owes the next move. */
const needsMe = new Set(["NEEDS_RECAPTURE", "ACCEPTED", "CHECK_ACCEPTED"]);
const finished = new Set(["VERIFIED", "REJECTED", "EXPIRED"]);

function statusTone(status: string) {
  if (status === "VERIFIED") {
    return { dot: "bg-[var(--good)]", text: "text-[var(--good)]" };
  }
  if (status === "REJECTED" || status === "EXPIRED") {
    return { dot: "bg-[var(--bad)]", text: "text-[var(--bad)]" };
  }
  return { dot: "bg-[var(--amber)]", text: "text-[var(--amber)]" };
}

function TaskCard({ job }: { job: Job }) {
  const asInstaller = job.isInstaller;
  const fee = feeForWorker(job, !asInstaller);
  const tone = statusTone(job.status);
  const actionable = needsMe.has(job.status);

  return (
    <Link
      href={`/worker/${job.id}`}
      className={`block rounded-2xl border bg-[var(--surface)] p-4 transition-colors active:bg-[var(--raised)] ${
        actionable ? "border-[var(--amber-line)]" : "border-[var(--line)]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold">
            {job.placementInstructions ?? job.venueName}
          </h3>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            {asInstaller ? "You stick & verify this" : "You are spot checking this"}
          </p>
        </div>
        <span className="shrink-0 text-[16px] font-bold tracking-[-0.02em]">
          {formatMoney(fee, job.currency)}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
        <span className={`flex items-center gap-2 text-[13px] font-medium ${tone.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
          {statusLabel[job.status]}
        </span>
        {actionable && (
          <span className="shrink-0 text-[13px] font-semibold text-[var(--ink)]">
            Continue →
          </span>
        )}
      </div>
    </Link>
  );
}

function Group({ title, jobs }: { title: string; jobs: Job[] }) {
  if (jobs.length === 0) return null;

  return (
    <>
      <div className="mt-6 flex items-center gap-2.5 first:mt-0">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.07em] text-[var(--faint)]">
          {title}
        </h2>
        <span className="rounded-full bg-[var(--raised)] px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)]">
          {jobs.length}
        </span>
      </div>
      {jobs.map((job) => (
        <TaskCard key={job.id} job={job} />
      ))}
    </>
  );
}

export default function MyTasks() {
  const { myTasks: unsorted, ready } = useWorker();
  const myTasks = [...unsorted].sort(
    (a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9),
  );

  const action = myTasks.filter((job) => needsMe.has(job.status));
  const waiting = myTasks.filter(
    (job) => !needsMe.has(job.status) && !finished.has(job.status),
  );
  const done = myTasks.filter((job) => finished.has(job.status));

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">My work</h1>
      <p className="mt-1.5 text-[14px] text-[var(--muted)]">
        What needs you first, then what is being checked, then what is paid.
      </p>

      <div className="mt-5 flex flex-col gap-3">
        {!ready ? (
          <JobCardSkeleton rows={2} />
        ) : myTasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-12 text-center">
            <p className="text-[15px] font-semibold">No tasks yet</p>
            <p className="mx-auto mt-1.5 max-w-[32ch] text-[13px] leading-relaxed text-[var(--muted)]">
              Accept a job and it will show up here until it is paid.
            </p>
            <Link
              href="/worker"
              className="mt-5 inline-block rounded-2xl bg-[var(--solid)] px-5 py-3 text-[14px] font-bold text-[var(--solid-ink)] active:opacity-90"
            >
              Browse jobs
            </Link>
          </div>
        ) : (
          <>
            <Group title="Needs you" jobs={action} />
            <Group title="Being checked" jobs={waiting} />
            <Group title="Finished" jobs={done} />
          </>
        )}
      </div>
    </>
  );
}
