import {
  EvidenceStatus,
  JobRole,
  JobStatus,
  PlacementStatus,
  VerificationMode,
  type Job,
} from "@/generated/prisma/client";
import { perPlacementMinor } from "@/lib/campaigns/pricing";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import {
  assertJobTransition,
  assertPlacementTransition,
} from "@/lib/placements/state";

export type ProofInput = {
  scannedShortCode: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  capturedAt: Date;
  challengeSymbol: string;
  challengeResponse: string;
  challengeIssuedAt: Date;
  challengeExpiresAt: Date;
  /** sha256 of the captured media, 0x-prefixed hex. */
  mediaHash: string;
  mediaPath?: string | null;
};

/**
 * Where the placement goes after a proof, or null to stay put.
 *
 * SELF placements go straight to the confidential check after the installer's
 * proof. INDEPENDENT ones (spot checks) wait for a second worker. After a
 * rejection, the placement returns to final verification once every rejected
 * proof has been replaced.
 */
function nextPlacementPath(
  status: PlacementStatus,
  role: JobRole,
  jobs: Job[],
  mode: VerificationMode,
): PlacementStatus[] | null {
  const other = jobs.find(
    (job) => job.role === (role === JobRole.INSTALLER ? JobRole.VERIFIER : JobRole.INSTALLER),
  );

  if (role === JobRole.INSTALLER && mode === VerificationMode.SELF) {
    if (status === PlacementStatus.INSTALLING) {
      return [PlacementStatus.INSTALL_SUBMITTED, PlacementStatus.READY_FOR_FINAL_VERIFICATION];
    }
    if (status === PlacementStatus.NEEDS_RECAPTURE) {
      return [PlacementStatus.READY_FOR_FINAL_VERIFICATION];
    }
  }

  if (role === JobRole.INSTALLER && mode === VerificationMode.INDEPENDENT) {
    if (status === PlacementStatus.INSTALLING) {
      return [PlacementStatus.INSTALL_SUBMITTED, PlacementStatus.AWAITING_VERIFIER];
    }
    if (status === PlacementStatus.NEEDS_RECAPTURE) {
      if (other?.status === JobStatus.PROOF_SUBMITTED) {
        return [PlacementStatus.READY_FOR_FINAL_VERIFICATION];
      }
      if (other?.status === JobStatus.REJECTED_PROOF) return null;
      return [PlacementStatus.INSTALL_SUBMITTED, PlacementStatus.AWAITING_VERIFIER];
    }
  }

  if (role === JobRole.VERIFIER) {
    if (status === PlacementStatus.VERIFYING) {
      return [PlacementStatus.READY_FOR_FINAL_VERIFICATION];
    }
    if (status === PlacementStatus.NEEDS_RECAPTURE) {
      return other?.status === JobStatus.PROOF_SUBMITTED
        ? [PlacementStatus.READY_FOR_FINAL_VERIFICATION]
        : null;
    }
  }

  throw new ApiError(409, "PROOF_NOT_EXPECTED", "This placement is not waiting for that proof.");
}

/**
 * Records one proof and moves the worker's job and the placement on.
 *
 * Shared by the Worker PWA and the demo controls so both follow the same job
 * and placement rules. Exact coordinates and the media fingerprint are stored
 * for the confidential CRE check only; brands never see them.
 */
export async function recordProof(
  placementId: string,
  role: JobRole,
  workerUserId: string,
  proof: ProofInput,
) {
  await getPrismaClient().$transaction(async (transaction) => {
    const placement = await transaction.placement.findUniqueOrThrow({
      where: { id: placementId },
      include: { jobs: true, campaign: { select: { currency: true } } },
    });

    const job = placement.jobs.find(
      (item) => item.role === role && item.workerUserId === workerUserId,
    );
    if (!job) {
      throw new ApiError(
        403,
        "NOT_YOUR_JOB",
        `You do not hold the ${role.toLowerCase()} job for this placement.`,
      );
    }

    // A recapture resumes a rejected job before the new proof lands.
    if (job.status === JobStatus.REJECTED_PROOF) {
      assertJobTransition(job.status, JobStatus.IN_PROGRESS);
    } else {
      assertJobTransition(job.status, JobStatus.PROOF_SUBMITTED);
    }

    const path = nextPlacementPath(placement.status, role, placement.jobs, placement.verificationMode);
    const now = new Date();

    await transaction.evidence.create({
      data: {
        placementId,
        jobId: job.id,
        role,
        workerUserId,
        scannedShortCode: proof.scannedShortCode,
        latitude: proof.latitude,
        longitude: proof.longitude,
        accuracyMeters: proof.accuracyMeters ?? null,
        capturedAt: proof.capturedAt,
        challengeSymbol: proof.challengeSymbol,
        challengeResponse: proof.challengeResponse,
        challengeIssuedAt: proof.challengeIssuedAt,
        challengeExpiresAt: proof.challengeExpiresAt,
        mediaHash: proof.mediaHash.toLowerCase(),
        mediaPath: proof.mediaPath ?? null,
        status: EvidenceStatus.SUBMITTED,
      },
    });

    await transaction.job.update({
      where: { id: job.id },
      data: { status: JobStatus.PROOF_SUBMITTED, submittedAt: now },
    });

    if (!path) return;

    let current = placement.status;
    for (const step of path) {
      assertPlacementTransition(current, step);
      current = step;
    }

    await transaction.placement.update({
      where: { id: placementId },
      data: {
        status: current,
        ...(role === JobRole.INSTALLER && !placement.installedAt ? { installedAt: now } : {}),
      },
    });

    if (current === PlacementStatus.AWAITING_VERIFIER) {
      await transaction.job.createMany({
        data: [
          {
            placementId,
            campaignId: placement.campaignId,
            role: JobRole.VERIFIER,
            rewardMinor: BigInt(perPlacementMinor.verification),
            currency: placement.campaign.currency,
          },
        ],
        skipDuplicates: true,
      });
    }

    // A self-verified placement: the installer also did the verifying, so the
    // verifier job (and its reward) is theirs too. Settlement pays both.
    if (
      role === JobRole.INSTALLER &&
      placement.verificationMode === VerificationMode.SELF &&
      current === PlacementStatus.READY_FOR_FINAL_VERIFICATION
    ) {
      await transaction.job.upsert({
        where: { placementId_role: { placementId, role: JobRole.VERIFIER } },
        update: {
          workerUserId,
          status: JobStatus.PROOF_SUBMITTED,
          submittedAt: now,
        },
        create: {
          placementId,
          campaignId: placement.campaignId,
          role: JobRole.VERIFIER,
          rewardMinor: BigInt(perPlacementMinor.verification),
          currency: placement.campaign.currency,
          workerUserId,
          status: JobStatus.PROOF_SUBMITTED,
          acceptedAt: now,
          startedAt: now,
          submittedAt: now,
        },
      });
    }
  });
}

/**
 * The checker could not find the poster (spot checks). The installer must
 * recapture, and the check is released so it can happen again. No money
 * moves: the escrow only pays on an approved confidential verdict.
 */
export async function reportPosterMissing(
  placementId: string,
  verifierUserId: string,
  reason: string | undefined,
) {
  await getPrismaClient().$transaction(async (transaction) => {
    const placement = await transaction.placement.findUniqueOrThrow({
      where: { id: placementId },
      include: { jobs: true },
    });

    const verifierJob = placement.jobs.find(
      (job) => job.role === JobRole.VERIFIER && job.workerUserId === verifierUserId,
    );
    const installerJob = placement.jobs.find((job) => job.role === JobRole.INSTALLER);

    if (!verifierJob || placement.status !== PlacementStatus.VERIFYING) {
      throw new ApiError(409, "CHECK_NOT_YOURS", "This check is not assigned to you.");
    }

    assertJobTransition(verifierJob.status, JobStatus.OPEN);
    assertPlacementTransition(placement.status, PlacementStatus.NEEDS_RECAPTURE);

    await transaction.job.update({
      where: { id: verifierJob.id },
      data: { status: JobStatus.OPEN, workerUserId: null, acceptedAt: null, startedAt: null },
    });

    if (installerJob && installerJob.status === JobStatus.PROOF_SUBMITTED) {
      await transaction.job.update({
        where: { id: installerJob.id },
        data: { status: JobStatus.REJECTED_PROOF, resolvedAt: new Date() },
      });
    }

    await transaction.evidence.updateMany({
      where: { placementId, role: JobRole.INSTALLER, status: EvidenceStatus.SUBMITTED },
      data: {
        status: EvidenceStatus.REJECTED,
        rejectionReason: `VERIFIER:POSTER_NOT_FOUND${reason ? `:${reason}` : ""}`.slice(0, 64),
      },
    });

    await transaction.placement.update({
      where: { id: placementId },
      data: { status: PlacementStatus.NEEDS_RECAPTURE, verifierUserId: null },
    });
  });
}
