import {
  CampaignStatus,
  JobRole,
  JobStatus,
  PlacementStatus,
  type Prisma,
} from "@/generated/prisma/client";
import { getPrivyClient } from "@/lib/auth/privy";
import type { WorkerContext } from "@/lib/auth/require-worker";
import { distanceInMetres } from "@/lib/campaigns/geo";
import { perPlacementMinor } from "@/lib/campaigns/pricing";
import { isOnchainConfigured } from "@/lib/chain/config";
import { explorerTxUrl } from "@/lib/chain/explorer";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import { reportPosterMissing, recordProof } from "@/lib/jobs/proof";
import { acceptJob, startJob } from "@/lib/jobs/service";
import type {
  WorkerTaskDto,
  WorkerTaskStatusValue,
  WorkerWalletDto,
} from "@/lib/jobs/types";
import { assignPlacementWorkers } from "@/lib/onchain/placements";
import { createProofViewUrl, hashProofObject } from "@/lib/storage/proofs";
import { isCreRunnerAvailable, startVerificationRun } from "@/lib/verification/runner";

/**
 * The Worker PWA's view of placements.
 *
 * The app thinks in "jobs": one poster, seen by a worker as its installer or
 * its checker. Here that job is a placement, and every action goes through the
 * same job rules, escrow calls and confidential verification as the rest of
 * StickerBomb.
 */

/** Immediate feedback only; the confidential check enforces the real fence. */
const PRECHECK_RADIUS_METRES = 250;

const workableCampaignStatuses: CampaignStatus[] = [
  CampaignStatus.ASSETS_READY,
  CampaignStatus.DEPLOYING,
  CampaignStatus.VERIFYING,
  CampaignStatus.LIVE,
];

const holdingStatuses: JobStatus[] = [
  JobStatus.ACCEPTED,
  JobStatus.IN_PROGRESS,
  JobStatus.REJECTED_PROOF,
];

const taskInclude = {
  campaign: { select: { name: true, deadline: true } },
  location: {
    select: {
      venueName: true,
      city: true,
      latitude: true,
      longitude: true,
      placementInstructions: true,
    },
  },
  asset: { select: { shortCode: true } },
  jobs: true,
  evidence: {
    select: { role: true, status: true, rejectionReason: true, mediaPath: true },
    orderBy: { createdAt: "desc" },
  },
} satisfies Prisma.PlacementInclude;

type TaskRecord = Prisma.PlacementGetPayload<{ include: typeof taskInclude }>;

function approximate(value: number) {
  return Math.round(value * 100) / 100;
}

function taskStatus(
  placement: TaskRecord,
  isInstaller: boolean,
  isVerifier: boolean,
): WorkerTaskStatusValue {
  const mine = placement.jobs.find(
    (job) =>
      (isInstaller && job.role === JobRole.INSTALLER) ||
      (isVerifier && job.role === JobRole.VERIFIER),
  );
  const mustProve = Boolean(mine && holdingStatuses.includes(mine.status));

  switch (placement.status) {
    case PlacementStatus.VERIFIED:
    case PlacementStatus.REMOVING:
    case PlacementStatus.REMOVED:
      return "VERIFIED";
    case PlacementStatus.CANCELLED:
      return "EXPIRED";
    default:
      break;
  }

  if (mustProve) return isInstaller ? "ACCEPTED" : "CHECK_ACCEPTED";

  switch (placement.status) {
    case PlacementStatus.AWAITING_INSTALL:
      return placement.jobs.some((job) => job.role === JobRole.INSTALLER && job.status === JobStatus.OPEN)
        ? "OPEN"
        : "ACCEPTED";
    case PlacementStatus.INSTALLING:
      return "ACCEPTED";
    case PlacementStatus.INSTALL_SUBMITTED:
    case PlacementStatus.AWAITING_VERIFIER:
      return "AWAITING_CHECK";
    case PlacementStatus.VERIFYING:
      return "CHECK_ACCEPTED";
    case PlacementStatus.READY_FOR_FINAL_VERIFICATION:
      return "IN_REVIEW";
    case PlacementStatus.NEEDS_RECAPTURE:
      return "NEEDS_RECAPTURE";
    default:
      return "OPEN";
  }
}

function toTask(placement: TaskRecord, userId: string): WorkerTaskDto {
  const isInstaller = placement.installerUserId === userId;
  const isVerifier = placement.verifierUserId === userId;
  // Exact location only once this worker has taken responsibility for the job.
  const revealed = isInstaller || isVerifier;
  const installerJob = placement.jobs.find((job) => job.role === JobRole.INSTALLER);
  const verifierJob = placement.jobs.find((job) => job.role === JobRole.VERIFIER);
  const myRole = isInstaller ? JobRole.INSTALLER : isVerifier ? JobRole.VERIFIER : null;
  const myRejection = myRole
    ? placement.evidence.find((item) => item.role === myRole)
    : undefined;

  return {
    id: placement.id,
    status: taskStatus(placement, isInstaller, isVerifier),
    campaignName: placement.campaign.name,
    venueName: revealed ? placement.location.venueName : `Approved surface in ${placement.location.city}`,
    city: placement.location.city,
    latitude: revealed ? placement.location.latitude : approximate(placement.location.latitude),
    longitude: revealed ? placement.location.longitude : approximate(placement.location.longitude),
    placementInstructions: revealed ? placement.location.placementInstructions : null,
    shortCode: placement.asset.shortCode,
    installerFeeMinor: (installerJob?.rewardMinor ?? BigInt(perPlacementMinor.installation)).toString(),
    verifierFeeMinor: (verifierJob?.rewardMinor ?? BigInt(perPlacementMinor.verification)).toString(),
    currency: installerJob?.currency ?? "USD",
    deadline: placement.campaign.deadline?.toISOString() ?? null,
    proofAt: installerJob?.submittedAt?.toISOString() ?? null,
    checkedAt: verifierJob?.submittedAt?.toISOString() ?? null,
    isInstaller,
    isVerifier,
    rejectionReason:
      myRejection?.status === "REJECTED" ? myRejection.rejectionReason ?? "REJECTED" : null,
  };
}

async function loadTask(placementId: string) {
  const placement = await getPrismaClient().placement.findUnique({
    where: { id: placementId },
    include: taskInclude,
  });
  if (!placement) throw new ApiError(404, "JOB_NOT_FOUND", "That job no longer exists.");
  return placement;
}

const fundedCampaign = {
  status: { in: workableCampaignStatuses },
  fundedAt: { not: null },
} satisfies Prisma.CampaignWhereInput;

/** Placements open for installation, plus the one this worker is installing. */
export async function listPlaceableTasks(context: WorkerContext) {
  const placements = await getPrismaClient().placement.findMany({
    where: {
      campaign: fundedCampaign,
      OR: [
        {
          status: PlacementStatus.AWAITING_INSTALL,
          jobs: { some: { role: JobRole.INSTALLER, status: JobStatus.OPEN } },
        },
        {
          installerUserId: context.userId,
          jobs: {
            some: {
              role: JobRole.INSTALLER,
              workerUserId: context.userId,
              status: { in: holdingStatuses },
            },
          },
        },
      ],
    },
    include: taskInclude,
    orderBy: { createdAt: "desc" },
  });
  return placements.map((placement) => toTask(placement, context.userId));
}

/** Checks this worker may take. Their own installations never appear. */
export async function listCheckableTasks(context: WorkerContext) {
  const placements = await getPrismaClient().placement.findMany({
    where: {
      campaign: fundedCampaign,
      OR: [
        {
          status: PlacementStatus.AWAITING_VERIFIER,
          installerUserId: { not: context.userId },
          jobs: { some: { role: JobRole.VERIFIER, status: JobStatus.OPEN } },
        },
        {
          verifierUserId: context.userId,
          jobs: {
            some: {
              role: JobRole.VERIFIER,
              workerUserId: context.userId,
              status: { in: holdingStatuses },
            },
          },
        },
      ],
    },
    include: taskInclude,
    orderBy: { updatedAt: "desc" },
  });
  return placements.map((placement) => toTask(placement, context.userId));
}

export async function listMyTasks(context: WorkerContext) {
  const placements = await getPrismaClient().placement.findMany({
    where: {
      OR: [{ installerUserId: context.userId }, { verifierUserId: context.userId }],
    },
    include: taskInclude,
    orderBy: { updatedAt: "desc" },
  });
  return placements.map((placement) => toTask(placement, context.userId));
}

export async function getTask(context: WorkerContext, placementId: string) {
  const placement = await loadTask(placementId);
  const task = toTask(placement, context.userId);

  // The installer's photo is what the checker compares against, so it is shown
  // to the installer and the assigned checker only.
  if (task.isInstaller || task.isVerifier) {
    const photo = placement.evidence.find(
      (item) => item.role === JobRole.INSTALLER && item.mediaPath,
    );
    task.proofPhotoUrl = photo?.mediaPath
      ? await createProofViewUrl(photo.mediaPath).catch(() => null)
      : null;
  }

  return task;
}

function jobFor(placement: TaskRecord, role: JobRole) {
  const job = placement.jobs.find((item) => item.role === role);
  if (!job) {
    throw new ApiError(409, "JOB_UNAVAILABLE", "This job is not available right now.");
  }
  return job;
}

async function claimAndStart(context: WorkerContext, placementId: string, role: JobRole) {
  const placement = await loadTask(placementId);
  const job = jobFor(placement, role);

  if (!(job.workerUserId === context.userId && job.status === JobStatus.ACCEPTED)) {
    await acceptJob(context, job.id);
  }
  await startJob(context, job.id);
  return getTask(context, placementId);
}

export function acceptPlacement(context: WorkerContext, placementId: string) {
  return claimAndStart(context, placementId, JobRole.INSTALLER);
}

export function acceptCheck(context: WorkerContext, placementId: string) {
  return claimAndStart(context, placementId, JobRole.VERIFIER);
}

export type PhotoProof = {
  photoPath?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
};

/** Uploads land under `<placementId>/<userId>-…`; nothing else may be claimed. */
function assertOwnPhoto(placementId: string, userId: string, photoPath?: string) {
  if (!photoPath) {
    throw new ApiError(422, "PHOTO_REQUIRED", "Attach a photo of the poster before submitting.");
  }
  if (!photoPath.startsWith(`${placementId}/${userId}-`)) {
    throw new ApiError(403, "PHOTO_NOT_YOURS", "That photo was not uploaded for this job.");
  }
  return photoPath;
}

async function submitPhotoProof(
  context: WorkerContext,
  placementId: string,
  role: JobRole,
  proof: PhotoProof,
) {
  const photoPath = assertOwnPhoto(placementId, context.userId, proof.photoPath);

  if (proof.latitude === undefined || proof.longitude === undefined) {
    throw new ApiError(
      422,
      "LOCATION_REQUIRED",
      "Allow location access and retake the photo, so the check knows where it was taken.",
    );
  }

  const placement = await loadTask(placementId);
  const job = jobFor(placement, role);
  if (job.workerUserId !== context.userId) {
    throw new ApiError(403, "NOT_YOUR_JOB", "This job is not assigned to you.");
  }

  const metres = distanceInMetres(
    { latitude: proof.latitude, longitude: proof.longitude },
    placement.location,
  );
  if (metres > PRECHECK_RADIUS_METRES) {
    throw new ApiError(422, "OUTSIDE_GEOFENCE", "You are too far from the venue to submit proof.", {
      metresAway: Math.round(metres),
      allowedMetres: PRECHECK_RADIUS_METRES,
    });
  }

  // Hashing the stored bytes both proves the upload finished and gives the
  // confidential check a fingerprint to catch reused photos.
  const mediaHash = await hashProofObject(photoPath);
  if (!mediaHash) {
    throw new ApiError(422, "PHOTO_NOT_UPLOADED", "Your photo did not finish uploading. Please try again.");
  }

  const now = new Date();
  // The live on-camera challenge is not in the app yet: the photo itself is the
  // response, and the window runs from when the job was started.
  await recordProof(placementId, role, context.userId, {
    scannedShortCode: placement.asset.shortCode,
    latitude: proof.latitude,
    longitude: proof.longitude,
    accuracyMeters: proof.accuracyMeters ?? null,
    capturedAt: now,
    challengeSymbol: "PHOTO",
    challengeResponse: "PHOTO",
    challengeIssuedAt: job.startedAt ?? job.acceptedAt ?? new Date(now.getTime() - 60_000),
    challengeExpiresAt: new Date(now.getTime() + 5 * 60_000),
    mediaHash,
    mediaPath: photoPath,
  });
}

export async function submitInstallProof(
  context: WorkerContext,
  placementId: string,
  proof: PhotoProof,
) {
  await submitPhotoProof(context, placementId, JobRole.INSTALLER, proof);
  return getTask(context, placementId);
}

/** Every worker receives payouts in a Privy wallet held for them. */
export async function ensurePayoutWallet(userId: string) {
  const prisma = getPrismaClient();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.walletAddress) return user.walletAddress;

  const wallet = await getPrivyClient().wallets().create({
    chain_type: "ethereum",
    display_name: "StickerBomb worker payouts",
    idempotency_key: `worker-payout-${userId}`,
  });
  await prisma.user.updateMany({
    where: { id: userId, walletAddress: null },
    data: { walletAddress: wallet.address },
  });
  return wallet.address;
}

/**
 * The independent check. Once both proofs are in, both payout wallets are
 * recorded in escrow and the Chainlink CRE confidential verification starts;
 * the escrow pays both workers when it approves.
 */
export async function confirmPlacement(
  context: WorkerContext,
  placementId: string,
  proof: PhotoProof,
  appUrl: string,
) {
  await submitPhotoProof(context, placementId, JobRole.VERIFIER, proof);

  const placement = await loadTask(placementId);
  if (placement.status === PlacementStatus.READY_FOR_FINAL_VERIFICATION && isOnchainConfigured()) {
    try {
      for (const userId of [placement.installerUserId, placement.verifierUserId]) {
        if (userId) await ensurePayoutWallet(userId);
      }
      await assignPlacementWorkers(placementId);
      if (isCreRunnerAvailable()) await startVerificationRun(placementId, appUrl);
    } catch (error) {
      // The proofs are safely recorded; settlement can be retried from the
      // brand's campaign page.
      console.error("Could not start settlement after the check", error);
    }
  }

  return getTask(context, placementId);
}

export async function rejectPlacement(
  context: WorkerContext,
  placementId: string,
  reason?: string,
) {
  await reportPosterMissing(placementId, context.userId, reason);
  return getTask(context, placementId);
}

/** Whether this worker currently owes proof on the placement (gates uploads). */
export async function assertAwaitingProof(context: WorkerContext, placementId: string) {
  const placement = await loadTask(placementId);
  const owesProof = placement.jobs.some(
    (job) => job.workerUserId === context.userId && holdingStatuses.includes(job.status),
  );
  if (!owesProof) {
    throw new ApiError(403, "NOT_YOUR_JOB", "This job is not waiting for your photo.");
  }
}

export async function getWallet(context: WorkerContext): Promise<WorkerWalletDto> {
  const prisma = getPrismaClient();
  const [user, jobs] = await Promise.all([
    prisma.user.findUnique({ where: { id: context.userId }, select: { walletAddress: true } }),
    prisma.job.findMany({
      where: { workerUserId: context.userId },
      include: {
        placement: {
          select: {
            location: { select: { venueName: true } },
            chainTransactions: {
              where: { kind: "PLACEMENT_VERIFIED" },
              select: { txHash: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const sum = (statuses: JobStatus[]) =>
    jobs
      .filter((job) => statuses.includes(job.status))
      .reduce((total, job) => total + job.rewardMinor, BigInt(0));

  return {
    earnedMinor: sum([JobStatus.PAID]).toString(),
    pendingMinor: sum([
      JobStatus.ACCEPTED,
      JobStatus.IN_PROGRESS,
      JobStatus.PROOF_SUBMITTED,
      JobStatus.ACCEPTED_PROOF,
      JobStatus.REJECTED_PROOF,
    ]).toString(),
    currency: "USD",
    payoutAddress: user?.walletAddress ?? null,
    history: jobs
      .filter((job) => job.status === JobStatus.PAID)
      .map((job) => {
        const txHash = job.placement.chainTransactions[0]?.txHash ?? null;
        return {
          id: job.id,
          kind: job.role === JobRole.INSTALLER ? "INSTALLER_PAYOUT" : "VERIFIER_PAYOUT",
          amountMinor: job.rewardMinor.toString(),
          venueName: job.placement.location.venueName,
          createdAt: (job.paidAt ?? job.updatedAt).toISOString(),
          explorerUrl: txHash ? explorerTxUrl(txHash) : null,
        };
      }),
  };
}
