"use client";

import Link from "next/link";
import { useWorker } from "@/components/worker/WorkerStore";
import JobCardSkeleton from "@/components/worker/Skeleton";
import { feeForWorker, formatDate, formatMoney, type Job } from "@/lib/worker-data";

function JobCard({ job, kind }: { job: Job; kind: "place" | "check" }) {
  const fee = feeForWorker(job, kind === "check");
  const mine = kind === "place" && job.isInstaller;

  return (
    <Link
      href={`/worker/${job.id}`}
      className="group block rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 transition-colors active:bg-[var(--raised)]"
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
        <span className="shrink-0 text-right">
          <span className="block text-[20px] font-bold leading-none tracking-[-0.02em]">
            {formatMoney(fee, job.currency)}
          </span>
          <span className="mt-1 block text-[11px] text-[var(--faint)]">
            {kind === "place" ? "to place" : "to check"}
          </span>
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
          <span className="flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--raised)] px-2.5 py-1 text-[12px] text-[var(--muted)]">
            <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
              <rect
                x="5"
                y="11"
                width="14"
                height="9"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M8 11V8a4 4 0 0 1 8 0v3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            Money locked
          </span>
        )}
      </div>
    </Link>
  );
}

function SectionLabel({ children, count }: { children: string; count: number }) {
  return (
    <div className="mt-6 flex items-center gap-2.5 first:mt-0">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.07em] text-[var(--faint)]">
        {children}
      </h2>
      <span className="rounded-full bg-[var(--raised)] px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)]">
        {count}
      </span>
    </div>
  );
}

export default function WorkerJobs() {
  const { placeJobs, checkJobs, ready, loading, error, refresh } = useWorker();
  const total = placeJobs.length + checkJobs.length;
  const busy = !ready || loading;

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
            Find work
          </h1>
          <p className="mt-1.5 text-[14px] text-[var(--muted)]">
            {busy
              ? "Looking for jobs near you…"
              : total > 0
                ? `${total} paid job${total === 1 ? "" : "s"} near you. The money is already locked.`
                : "Paid poster jobs near you."}
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={busy}
          aria-label="Refresh jobs"
          className="mt-1 shrink-0 rounded-full border border-[var(--line)] p-2 text-[var(--muted)] active:bg-[var(--raised)] disabled:opacity-40"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
          >
            <path
              d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

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
        {busy ? (
          <JobCardSkeleton />
        ) : total === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--raised)]">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-[var(--faint)]">
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
                <path
                  d="m16 16 4 4"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className="mt-4 text-[15px] font-semibold">
              Nothing near you right now
            </p>
            <p className="mx-auto mt-1.5 max-w-[34ch] text-[13px] leading-relaxed text-[var(--muted)]">
              New jobs appear as soon as a brand funds a campaign. Pull the refresh
              button to check again.
            </p>
          </div>
        ) : (
          <>
            {checkJobs.length > 0 && (
              <>
                <SectionLabel count={checkJobs.length}>Quick checks</SectionLabel>
                {checkJobs.map((job) => (
                  <JobCard key={`c-${job.id}`} job={job} kind="check" />
                ))}
              </>
            )}

            {placeJobs.length > 0 && (
              <>
                <SectionLabel count={placeJobs.length}>Put up a poster</SectionLabel>
                {placeJobs.map((job) => (
                  <JobCard key={`p-${job.id}`} job={job} kind="place" />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
