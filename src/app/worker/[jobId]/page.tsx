"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import LivePresencePanel, {
  useLivePresence,
} from "@/components/worker/LivePresence";
import VenueMap from "@/components/worker/VenueMap";
import PosterCodeField from "@/components/worker/PosterCodeField";
import ProofChecklist from "@/components/worker/ProofChecklist";
import SpotPhoto from "@/components/worker/SpotPhoto";
import { useWorker } from "@/components/worker/WorkerStore";
import { ClientApiError } from "@/lib/api/authenticated-fetch";
import {
  describeRejection,
  describeSubmissionError,
  feeForWorker,
  formatDate,
  formatMoney,
} from "@/lib/worker-data";

type Fix = { latitude: number; longitude: number } | null;

/** What the map's fence is drawn at — see LivePresence.DISPLAYED_RADIUS_METERS. */
const DISPLAYED_RADIUS_METERS = 500;

function actionErrorMessage(error: unknown) {
  if (!(error instanceof ClientApiError)) {
    return "Could not update this job. Please try again.";
  }

  const help = describeSubmissionError(error.code);
  return help ? `${error.message} ${help}` : error.message;
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
  const [photo, setPhoto] = useState<File | null>(null);
  const [fix, setFix] = useState<Fix>(null);
  const [locating, setLocating] = useState(false);
  const [jobLoading, setJobLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Live tracking runs only while this worker owes proof on the job.
  const owesProof = job
    ? (job.status === "ACCEPTED" && job.isInstaller) ||
      (job.status === "CHECK_ACCEPTED" && job.isVerifier)
    : false;
  const presence = useLivePresence(jobId, owesProof);

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

  // The live watcher is fresher than the single fix taken at capture time.
  const proofFix = presence.fix ?? fix;
  const scannedShortCode = code.trim();
  // Only hold the worker back when we actually have a reading to hold them to;
  // if location is unavailable the server and the confidential check still
  // enforce the real fence.
  const awaitingArrival = presence.reading
    ? !presence.reading.readyToVerify
    : false;
  const canSubmitProof =
    Boolean(photo) &&
    scannedShortCode.length > 0 &&
    !awaitingArrival &&
    !locating &&
    !acting;

  function capture(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setShot(URL.createObjectURL(file));
    setPhoto(file);
    setFix(null);

    if (!navigator.geolocation) return;

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFix({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setLocating(false);
      },
      () => setLocating(false),
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
          {/* A local blob: preview, which next/image cannot optimise. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot} alt="Proof" className="h-[220px] w-full object-cover" />
          <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3">
            <p className="text-[13px] text-[var(--muted)]">
              {locating
                ? "Getting location"
                : proofFix
                  ? `Location saved · ${proofFix.latitude.toFixed(4)}, ${proofFix.longitude.toFixed(4)}`
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
        // Not router.back(): this page is also reached from a push
        // notification or the pinned active-job bar, where there is no app
        // history to go back to and this would leave the app entirely.
        onClick={() => router.push("/worker/tasks")}
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
          {formatMoney(feeForWorker(job, isChecker), job.currency)}
        </span>
      </div>

      <div className="mt-5">
        <VenueMap
          lat={job.latitude}
          lng={job.longitude}
          label={
            job.placementInstructions ??
            `${job.venueName} · exact spot after you accept`
          }
          // The map fence is deliberately the advertised 500 m, not the
          // real (possibly widened) enforcement radius — see LivePresence.
          radiusMeters={owesProof ? DISPLAYED_RADIUS_METERS : undefined}
          fix={owesProof ? presence.fix : null}
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

      {job.rejectionReason &&
        (job.status === "ACCEPTED" || job.status === "CHECK_ACCEPTED") && (
          <p className="mt-4 rounded-xl border border-[var(--amber-line)] bg-[var(--amber-soft)] px-4 py-3 text-[13px] text-[var(--amber)]">
            {describeRejection(job.rejectionReason)} Take a new photo at the approved
            surface. Payment stays locked until it passes.
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
          <LivePresencePanel
            presence={presence}
            minDwellSeconds={job.minDwellSeconds}
          />
          <PosterCodeField
            value={code}
            onChange={setCode}
            disabled={acting}
          />
          {captureBlock}
          <ProofChecklist
            onSite={!awaitingArrival}
            hasCode={scannedShortCode.length > 0}
            hasPhoto={Boolean(photo)}
          />
          <button
            disabled={!canSubmitProof}
            onClick={() =>
              void runAction(
                () =>
                  submitProof(job.id, {
                    photo: photo!,
                    scannedShortCode,
                    ...(proofFix ?? {}),
                  }),
                true,
              )
            }
            className="mt-4 w-full rounded-2xl bg-[var(--solid)] py-4 text-[16px] font-bold text-[var(--solid-ink)] disabled:opacity-35"
          >
            {acting
              ? "Submitting proof"
              : job.verificationMode === "SELF"
                ? "Stick & verify"
                : "Submit proof"}
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
          {job.proofPhotoUrl && (
            <div className="mt-6">
              <h2 className="text-[15px] font-semibold">
                What the installer submitted
              </h2>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={job.proofPhotoUrl}
                alt="Installer's photo of the poster"
                className="mt-2 w-full rounded-2xl border border-[var(--line)]"
              />
            </div>
          )}
          <LivePresencePanel
            presence={presence}
            minDwellSeconds={job.minDwellSeconds}
          />
          <PosterCodeField
            value={code}
            onChange={setCode}
            disabled={acting}
          />
          {captureBlock}
          <ProofChecklist
            onSite={!awaitingArrival}
            hasCode={scannedShortCode.length > 0}
            hasPhoto={Boolean(photo)}
          />
          <div className="mt-4 flex gap-3">
            <button
              disabled={!canSubmitProof}
              onClick={() =>
                void runAction(
                  () =>
                    confirmPlacement(job.id, {
                      photo: photo!,
                      scannedShortCode,
                      ...(proofFix ?? {}),
                    }),
                  true,
                )
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

      {job.status === "IN_REVIEW" && (
        <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <p className="text-[15px] font-semibold text-[var(--amber)]">
            Confidential check running
          </p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--muted)]">
            Both photos are being compared inside a secure enclave. Nobody sees your
            location or photo; when it passes, the escrow pays both of you.
          </p>
        </div>
      )}

      {job.status === "NEEDS_RECAPTURE" && (
        <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <p className="text-[15px] font-semibold">Waiting for a new photo</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--muted)]">
            One of the photos did not pass the check. Payment stays locked until a new
            one does.
          </p>
        </div>
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
            The checker could not find this poster. Payment stays locked in escrow.
          </p>
        </div>
      )}
    </>
  );
}
