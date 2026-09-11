"use client";

import Link from "next/link";
import { useWorker } from "@/components/worker/WorkerStore";
import { formatDate, formatMoney, type Job } from "@/lib/worker-data";

function JobCard({ job, kind }: { job: Job; kind: "place" | "check" }) {
  // A self-verified poster pays the placing and the verifying fee to one person.
  const fee =
    kind === "place"
      ? job.verificationMode === "SELF"
        ? String(BigInt(job.installerFeeMinor) + BigInt(job.verifierFeeMinor))
        : job.installerFeeMinor
      : job.verifierFeeMinor;
  const mine = kind === "place" && job.isInstaller;

  return (
    <Link
      href={`/worker/${job.id}`}
      className="block rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 active:opacity-80"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[16px] font-semibold">
            {kind === "place" ? "Stick 1 poster" : "Spot check 1 poster"}
            {kind === "check" ? (
              <span className="rounded-full bg-[var(--amber-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--amber)]">
                Quick
              </span>
            ) : null}
          </h3>
          <p className="mt-1 truncate text-[14px] text-[var(--muted)]">
            {job.venueName} · {job.city}
          </p>
        </div>
        <span className="shrink-0 text-[20px] font-bold tracking-[-0.02em]">
          {formatMoney(fee, job.currency)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-[var(--line)] bg-[var(--raised)] px-2.5 py-1 text-[12px] text-[var(--muted)]">
          {formatDate(job.deadline)}
        </span>
        {mine ? (
          <span className="rounded-full border border-[var(--amber-line)] bg-[var(--amber-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--amber)]">
            Accepted by you
          </span>
        ) : (
          <span className="rounded-full border border-[var(--line)] bg-[var(--raised)] px-2.5 py-1 text-[12px] text-[var(--muted)]">
            Money already locked
          </span>
        )}
      </div>
    </Link>
  );
}

export default function WorkerJobs() {
  const { placeJobs, checkJobs, ready, loading, error, refresh } = useWorker();
  const total = placeJobs.length + checkJobs.length;

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
        Find work
      </h1>
      <p className="mt-1.5 text-[14px] text-[var(--muted)]">
        {total > 0
          ? `${total} paid job${total === 1 ? "" : "s"} near you. The money is already locked.`
          : "Paid poster jobs near you."}
      </p>

      {error && (
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[13px] text-[var(--bad)]">
          <p>{error}</p>
          <button
            onClick={() => void refresh()}
            className="mt-2 font-semibold text-[var(--amber)]"
          >
            Try again
          </button>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3">
        {!ready || loading ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
            <p className="text-[15px] font-medium">Loading jobs</p>
          </div>
        ) : total === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
            <p className="text-[15px] font-medium">Nothing near you right now</p>
            <p className="mt-1.5 text-[13px] text-[var(--muted)]">
              New jobs appear as soon as a brand funds a campaign.
            </p>
          </div>
        ) : (
          <>
            {checkJobs.map((job) => <JobCard key={`c-${job.id}`} job={job} kind="check" />)}
            {placeJobs.map((job) => <JobCard key={`p-${job.id}`} job={job} kind="place" />)}
          </>
        )}
      </div>
    </>
  );
}
