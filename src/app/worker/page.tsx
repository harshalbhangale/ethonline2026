"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useWorker } from "@/components/worker/WorkerStore";
import JobCardSkeleton from "@/components/worker/Skeleton";
import { feeForWorker, formatDate, formatMoney, type Job } from "@/lib/worker-data";

function WorldMark() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.7 8h12.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M8 1.7c1.7 1.8 2.6 4 2.6 6.3S9.7 12.5 8 14.3C6.3 12.5 5.4 10.3 5.4 8S6.3 3.5 8 1.7Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function Step({ children, done = false }: { children: ReactNode; done?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          done ? "bg-[var(--amber)]" : "bg-[var(--faint)]"
        }`}
      />
      {children}
    </span>
  );
}

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
            {kind === "place" ? "Put up 1 poster" : "Verify 1 poster"}
            {kind === "check" ? (
              <span className="rounded-full bg-[var(--amber-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--amber)]">
                Quick
              </span>
            ) : null}
          </h3>
          {/* A self-verified placement is one trip: both steps on one card. */}
          {kind === "place" && job.verificationMode === "SELF" ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-[var(--muted)]">
              <Step done>Put it up</Step>
              <svg viewBox="0 0 12 12" fill="none" className="h-2.5 w-2.5 shrink-0 text-[var(--faint)]">
                <path d="m4 2.5 3.5 3.5L4 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <Step>Verify it</Step>
            </p>
          ) : null}
          <p className="mt-1 truncate text-[14px] text-[var(--muted)]">
            {job.venueName} · {job.city}
          </p>
        </div>
        <span className="shrink-0 text-right">
          <span className="block text-[20px] font-bold leading-none tracking-[-0.02em]">
            {formatMoney(fee, job.currency)}
          </span>
          <span className="mt-1 block text-[11px] text-[var(--faint)]">
            {kind === "check"
              ? "to verify"
              : job.verificationMode === "SELF"
                ? "both steps"
                : "to put up"}
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

function EmptySlot({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-5">
      <p className="text-[13px] leading-relaxed text-[var(--faint)]">{children}</p>
    </div>
  );
}

function Tab({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13.5px] font-semibold transition-colors ${
        active
          ? "bg-[var(--solid)] text-[var(--solid-ink)]"
          : "text-[var(--muted)] active:bg-[var(--raised)]"
      }`}
    >
      {children}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
          active
            ? "bg-[var(--solid-ink)]/12 text-[var(--solid-ink)]"
            : "bg-[var(--raised)] text-[var(--muted)]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export default function WorkerJobs() {
  const { placeJobs, checkJobs, ready, loading, error, errorCode, refresh } = useWorker();
  const [tab, setTab] = useState<"place" | "check">("place");
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

      {/* The identity gate is a setup step, not a failure, so it gets its own
          card instead of the red error slot. */}
      {error && errorCode === "SELFIE_CHECK_REQUIRED" ? (
        <div className="mt-4 rounded-2xl border border-[var(--amber-line)] bg-[var(--amber-soft)] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--amber)] text-[var(--solid-ink)]">
              <WorldMark />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-bold tracking-[-0.01em]">
                One quick check before your first job
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
                World ID confirms you are a real person, so jobs cannot be
                farmed by bots. Takes about a minute.
              </p>
              <ul className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1">
                {["Face never sent to us", "Valid 90 days"].map((line) => (
                  <li
                    key={line}
                    className="flex items-center gap-1.5 text-[12px] text-[var(--faint)]"
                  >
                    <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3 text-[var(--good)]">
                      <path
                        d="m2.5 6.2 2.2 2.2 4.8-4.8"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href="/worker/profile"
                className="mt-3.5 inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--solid)] px-4 text-[13.5px] font-semibold text-[var(--solid-ink)] transition-opacity active:opacity-80"
              >
                <WorldMark />
                Verify with World ID
              </Link>
            </div>
          </div>
        </div>
      ) : error ? (
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[13px] text-[var(--bad)]">
          <p>{error}</p>
          <button
            onClick={() => void refresh()}
            className="mt-2 font-semibold text-[var(--amber)]"
          >
            Try again
          </button>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3">
        {busy ? (
          <JobCardSkeleton />
        ) : (
          <>
            <div className="flex gap-1 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-1">
              <Tab
                active={tab === "place"}
                count={placeJobs.length}
                onClick={() => setTab("place")}
              >
                Put up
              </Tab>
              <Tab
                active={tab === "check"}
                count={checkJobs.length}
                onClick={() => setTab("check")}
              >
                Verify
              </Tab>
            </div>

            {tab === "place" ? (
              placeJobs.length > 0 ? (
                placeJobs.map((job) => (
                  <JobCard key={`p-${job.id}`} job={job} kind="place" />
                ))
              ) : (
                <EmptySlot>
                  Nothing to put up nearby. New jobs land here as soon as a
                  brand funds a campaign.
                </EmptySlot>
              )
            ) : checkJobs.length > 0 ? (
              checkJobs.map((job) => (
                <JobCard key={`c-${job.id}`} job={job} kind="check" />
              ))
            ) : (
              <EmptySlot>
                Nothing to verify right now. These appear when a poster someone
                else put up gets drawn for a second check — a few minutes of
                work, paid like any other job.
              </EmptySlot>
            )}
          </>
        )}
      </div>
    </>
  );
}
