"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import MiniMap from "@/components/worker/MiniMap";
import SpotPhoto from "@/components/worker/SpotPhoto";
import { useWorker } from "@/components/worker/WorkerStore";
import { ClientApiError } from "@/lib/api/authenticated-fetch";
import { formatDate, formatMoney } from "@/lib/worker-data";

type Fix = { latitude: number; longitude: number } | null;

function actionErrorMessage(error: unknown) {
  return error instanceof ClientApiError
    ? error.message
    : "Could not update this job. Please try again.";
}

export default function JobDetail({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  const router = useRouter();
  const {
    ready,
    jobById,
    loadJob,
    acceptPlace,
    submitProof,
    acceptCheck,
    confirmPlacement,
    rejectPlacement,
  } = useWorker();
  const job = jobById(jobId);

  const [shot, setShot] = useState<string | null>(null);
  const [fix, setFix] = useState<Fix>(null);
  const [locating, setLocating] = useState(false);
  const [jobLoading, setJobLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setJobLoading(true);
    setActionError(null);

    void loadJob(jobId)
      .catch((error: unknown) => {
        if (!cancelled) setActionError(actionErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setJobLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, loadJob]);

  if (!job) {
    if (!ready || jobLoading) {
      return (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
          <p className="text-[15px] font-medium">Loading job</p>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
        <p className="text-[15px] font-medium">Job not found</p>
        {actionError && (
          <p className="mt-2 text-[13px] text-[var(--bad)]">{actionError}</p>
        )}
        <Link
          href="/worker"
          className="mt-3 inline-block text-[14px] text-[var(--amber)]"
        >
          Back to jobs
        </Link>
      </div>
    );
  }

  const isChecker =
    job.isVerifier ||
    (job.status === "AWAITING_CHECK" && !job.isInstaller);
  const revealed = Boolean(job.placementInstructions);
  const currentJob = job;

  function capture(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setShot(URL.createObjectURL(file));
    setLocating(true);
    if (!navigator.geolocation) {
      setFix({
        latitude: currentJob.latitude,
        longitude: currentJob.longitude,
      });
      setLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFix({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setLocating(false);
      },
      () => {
        setFix({
          latitude: currentJob.latitude,
          longitude: currentJob.longitude,
        });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function runAction(action: () => Promise<unknown>, redirect = false) {
    setActing(true);
    setActionError(null);

    try {
      await action();
      if (redirect) router.push("/worker/tasks");
    } catch (error) {
      setActionError(actionErrorMessage(error));
    } finally {
      setActing(false);
    }
  }

  const captureBlock = (
    <div className="mt-5">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={capture}
        className="hidden"
      />

      {shot ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
          <img src={shot} alt="Proof" className="h-[220px] w-full object-cover" />
          <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3">
            <p className="text-[13px] text-[var(--muted)]">
              {locating
                ? "Getting location"
                : fix
                  ? `Location saved · ${fix.latitude.toFixed(4)}, ${fix.longitude.toFixed(4)}`
                  : "No location"}
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              className="shrink-0 text-[13px] font-medium text-[var(--amber)]"
            >
              Retake
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex h-[132px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
            <rect
              x="3"
              y="7"
              width="18"
              height="13"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <circle cx="12" cy="13.5" r="3.6" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M9 7l1.2-2h3.6L15 7"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[14px] font-medium">Take a photo</span>
        </button>
      )}

      <p className="mt-3 text-[13px] leading-relaxed text-[var(--faint)]">
        Your photo and location stay private. The brand only sees that it was verified.
      </p>
    </div>
  );

  return (
    <>
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-1.5 text-[14px] text-[var(--muted)]"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
          <path
            d="M14 6l-6 6 6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back
      </button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-[-0.02em]">
            {isChecker ? "Check 1 poster" : "Put up 1 poster"}
          </h1>
          <p className="mt-1.5 text-[14px] text-[var(--muted)]">
            {job.campaignName} · {formatDate(job.deadline)}
          </p>
        </div>
        <span className="shrink-0 text-[24px] font-bold tracking-[-0.02em]">
          {formatMoney(
            isChecker ? job.verifierFeeMinor : job.installerFeeMinor,
            job.currency,
          )}
        </span>
      </div>

      <div className="mt-5">
        <MiniMap
          lat={job.latitude}
          lng={job.longitude}
          label={
            job.placementInstructions ??
            `${job.venueName} · exact spot after you accept`
          }
        />
      </div>

      {revealed && (
        <div className="mt-3">
          <SpotPhoto hint={job.placementInstructions ?? job.venueName} />
        </div>
      )}

      {actionError && (
        <p className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[13px] text-[var(--bad)]">
          {actionError}
        </p>
      )}

      {job.status === "OPEN" && (
        <div className="mt-6">
          <p className="text-[14px] leading-relaxed text-[var(--muted)]">
            Pick up the poster from the print point, put it on the approved surface,
            then send one photo. The money is already locked by the brand.
          </p>
          <button
            disabled={acting}
            onClick={() => void runAction(() => acceptPlace(job.id))}
            className="mt-4 w-full rounded-2xl bg-[var(--solid)] py-4 text-[16px] font-bold text-[var(--solid-ink)] disabled:opacity-35"
          >
            {acting ? "Accepting job" : "Accept job"}
          </button>
        </div>
      )}

      {job.status === "ACCEPTED" && job.isInstaller && (
        <>
          {captureBlock}
          <button
            disabled={!shot || acting}
            onClick={() =>
              void runAction(
                () => submitProof(job.id, fix ?? {}),
                true,
              )
            }
            className="mt-4 w-full rounded-2xl bg-[var(--solid)] py-4 text-[16px] font-bold text-[var(--solid-ink)] disabled:opacity-35"
          >
            {acting ? "Submitting proof" : "Submit proof"}
          </button>
        </>
      )}

      {job.status === "AWAITING_CHECK" && !job.isInstaller && (
        <div className="mt-6">
          <p className="text-[14px] leading-relaxed text-[var(--muted)]">
            Someone put this poster up {formatDate(job.proofAt)}. Go to the spot and
            confirm it is really there.
          </p>
          <button
            disabled={acting}
            onClick={() => void runAction(() => acceptCheck(job.id))}
            className="mt-4 w-full rounded-2xl bg-[var(--solid)] py-4 text-[16px] font-bold text-[var(--solid-ink)] disabled:opacity-35"
          >
            {acting ? "Accepting check" : "Accept check"}
          </button>
        </div>
      )}

      {job.status === "AWAITING_CHECK" && job.isInstaller && (
        <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <p className="text-[15px] font-semibold">Waiting to be checked</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--muted)]">
            Sent {formatDate(job.proofAt)}. A different verified person will confirm it.
            You cannot check your own work.
          </p>
        </div>
      )}

      {job.status === "CHECK_ACCEPTED" && job.isVerifier && (
        <>
          {captureBlock}
          <div className="mt-4 flex gap-3">
            <button
              disabled={!shot || acting}
              onClick={() =>
                void runAction(() => confirmPlacement(job.id), true)
              }
              className="flex-1 rounded-2xl bg-[var(--solid)] py-4 text-[16px] font-bold text-[var(--solid-ink)] disabled:opacity-35"
            >
              {acting ? "Saving" : "It is there"}
            </button>
            <button
              disabled={acting}
              onClick={() =>
                void runAction(() => rejectPlacement(job.id), true)
              }
              className="rounded-2xl border border-[var(--line)] px-5 py-4 text-[16px] font-semibold text-[var(--bad)] disabled:opacity-35"
            >
              Not there
            </button>
          </div>
        </>
      )}

      {job.status === "VERIFIED" && (
        <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <p className="text-[15px] font-semibold text-[var(--good)]">
            Verified and paid
          </p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--muted)]">
            Checked {formatDate(job.checkedAt)}. Both payments released.
          </p>
        </div>
      )}

      {job.status === "REJECTED" && (
        <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <p className="text-[15px] font-semibold text-[var(--bad)]">Rejected</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--muted)]">
            The checker could not find this poster. The money went back to the brand.
          </p>
        </div>
      )}
    </>
  );
}
