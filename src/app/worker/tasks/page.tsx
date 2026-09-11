"use client";

import Link from "next/link";
import { useWorker } from "@/components/worker/WorkerStore";
import { formatMoney, statusLabel } from "@/lib/worker-data";

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

export default function MyTasks() {
  const { myTasks: unsorted, ready } = useWorker();
  const myTasks = [...unsorted].sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9));

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">My work</h1>
      <p className="mt-1.5 text-[14px] text-[var(--muted)]">
        What needs you first, then what is being checked, then what is paid.
      </p>

      <div className="mt-5 flex flex-col gap-3">
        {!ready ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
            <p className="text-[15px] font-medium">Loading tasks</p>
          </div>
        ) : myTasks.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
            <p className="text-[15px] font-medium">No tasks yet</p>
            <Link
              href="/worker"
              className="mt-3 inline-block text-[14px] text-[var(--amber)]"
            >
              Browse jobs
            </Link>
          </div>
        ) : (
          myTasks.map((job) => {
            const asInstaller = job.isInstaller;
            const fee = asInstaller
              ? job.verificationMode === "SELF"
                ? String(BigInt(job.installerFeeMinor) + BigInt(job.verifierFeeMinor))
                : job.installerFeeMinor
              : job.verifierFeeMinor;
            const tone =
              job.status === "VERIFIED"
                ? "text-[var(--good)]"
                : job.status === "REJECTED"
                  ? "text-[var(--bad)]"
                  : "text-[var(--amber)]";

            return (
              <Link
                key={job.id}
                href={`/worker/${job.id}`}
                className="block rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 active:opacity-80"
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
                  <span className="shrink-0 text-[16px] font-bold">
                    {formatMoney(fee, job.currency)}
                  </span>
                </div>
                <p className={`mt-3 text-[13px] font-medium ${tone}`}>
                  {statusLabel[job.status]}
                </p>
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}
