"use client";

import Link from "next/link";
import { useWorker } from "@/components/worker/WorkerStore";
import { formatMoney, statusLabel } from "@/lib/worker-data";

export default function MyTasks() {
  const { myTasks, ready } = useWorker();

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">My tasks</h1>
      <p className="mt-1.5 text-[14px] text-[var(--muted)]">
        Everything you have accepted.
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
            const fee = asInstaller ? job.installerFeeMinor : job.verifierFeeMinor;
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
                      {asInstaller ? "You placed this" : "You are checking this"}
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
