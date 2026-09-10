"use client";

import Link from "next/link";
import { useState } from "react";
import { useWorker } from "@/components/worker/WorkerStore";
import { formatDate, formatMoney, type Job } from "@/lib/worker-data";

function JobCard({ job, kind }: { job: Job; kind: "place" | "check" }) {
  const fee =
    kind === "place" ? job.installerFeeMinor : job.verifierFeeMinor;
  const mine = kind === "place" && job.isInstaller;

  return (
    <Link
      href={`/worker/${job.id}`}
      className="block rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 active:opacity-80"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold">
            {kind === "place" ? "Put up 1 poster" : "Check 1 poster"}
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
  const [tab, setTab] = useState<"place" | "check">("place");
  const list = tab === "place" ? placeJobs : checkJobs;

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-[-0.02em]">
        Available jobs
      </h1>
      <p className="mt-1.5 text-[14px] text-[var(--muted)]">
        Pick a placement or independent check.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-1">
        {(["place", "check"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-xl py-2.5 text-[14px] font-semibold transition-colors ${
              tab === key
                ? "bg-[var(--solid)] text-[var(--solid-ink)]"
                : "text-[var(--muted)]"
            }`}
          >
            {key === "place" ? "Place" : "Check"}
            <span className="ml-1.5 text-[13px] font-medium opacity-70">
              {key === "place" ? placeJobs.length : checkJobs.length}
            </span>
          </button>
        ))}
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

      {tab === "check" && (
        <p className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[13px] leading-relaxed text-[var(--muted)]">
          Posters you put up never show here. Someone else checks your work.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {!ready || loading ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
            <p className="text-[15px] font-medium">Loading jobs</p>
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
            <p className="text-[15px] font-medium">Nothing here right now</p>
            <p className="mt-1.5 text-[13px] text-[var(--muted)]">
              New jobs appear when brands fund a campaign.
            </p>
          </div>
        ) : (
          list.map((job) => <JobCard key={job.id} job={job} kind={tab} />)
        )}
      </div>
    </>
  );
}
