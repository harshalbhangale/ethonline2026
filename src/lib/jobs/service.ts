import {
  LedgerEntryKind,
  PlacementJobRole,
  PlacementJobStatus,
} from "@/generated/prisma/client";
import type { WorkerContext } from "@/lib/auth/require-worker";
import { distanceInMetres } from "@/lib/campaigns/geo";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import { recordEntry, workerEarnedMinor } from "@/lib/ledger/service";
import { createProofViewUrl, proofObjectExists } from "@/lib/storage/proofs";
import type { WorkerJobDto } from "@/lib/jobs/types";

// Loose enough that a drifting phone fix near the venue still passes.
const proofRadiusMetres = 250;

const jobInclude = {
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
  asset: { select: { shortCode: true, sequence: true } },
} as const;

function toDto(
  job: Awaited<ReturnType<typeof findJobOrThrow>>,
  workerId: string,
): WorkerJobDto {
  const isInstaller = job.installerId === workerId;

  return {
    id: job.id,
    status: job.status,
    campaignName: job.campaign.name,
    venueName: job.location.venueName,
    city: job.location.city,
    latitude: job.location.latitude,
    longitude: job.location.longitude,
    // The exact instructions are the valuable part; they are withheld until
    // someone has actually taken responsibility for the job.
    placementInstructions:
      job.installerId === workerId ||
      job.verifierId === workerId ||
      job.status === PlacementJobStatus.CHECK_ACCEPTED
        ? job.location.placementInstructions
        : null,
    shortCode: job.asset.shortCode,
    installerFeeMinor: job.installerFeeMinor.toString(),
    verifierFeeMinor: job.verifierFeeMinor.toString(),
    currency: job.currency,
    deadline: job.deadline?.toISOString() ?? null,
    proofAt: job.proofAt?.toISOString() ?? null,
    checkedAt: job.checkedAt?.toISOString() ?? null,
    isInstaller,
    isVerifier: job.verifierId === workerId,
  };
}

async function findJobOrThrow(jobId: string) {
  const prisma = getPrismaClient();
  const job = await prisma.placementJob.findUnique({
    where: { id: jobId },
    include: jobInclude,
  });

  if (!job) {
    throw new ApiError(404, "JOB_NOT_FOUND", "That job no longer exists.");
  }

  return job;
}

/** Jobs anyone may pick up, plus the ones this worker is already installing. */
export async function listPlaceableJobs(context: WorkerContext) {
  const prisma = getPrismaClient();
  const jobs = await prisma.placementJob.findMany({
    where: {
      OR: [
        { status: PlacementJobStatus.OPEN, installerId: null },
        {
          status: PlacementJobStatus.ACCEPTED,
          installerId: context.workerId,
        },
      ],
    },
    include: jobInclude,
    orderBy: { createdAt: "desc" },
  });

  return jobs.map((job) => toDto(job, context.workerId));
}

/**
 * Jobs this worker may check.
 *
 * The self-check rule lives here rather than in the client: a worker never sees
 * a placement they installed, and `acceptCheck` refuses it again on write.
 */
export async function listCheckableJobs(context: WorkerContext) {
  const prisma = getPrismaClient();
  const jobs = await prisma.placementJob.findMany({
    where: {
      installerId: { not: context.workerId },
      OR: [
        { status: PlacementJobStatus.AWAITING_CHECK, verifierId: null },
        {
          status: PlacementJobStatus.CHECK_ACCEPTED,
          verifierId: context.workerId,
        },
      ],
    },
    include: jobInclude,
    orderBy: { proofAt: "desc" },
  });

  return jobs.map((job) => toDto(job, context.workerId));
}

export async function listMyJobs(context: WorkerContext) {
  const prisma = getPrismaClient();
  const jobs = await prisma.placementJob.findMany({
    where: {
      OR: [
        { installerId: context.workerId },
        { verifierId: context.workerId },
      ],
    },
    include: jobInclude,
    orderBy: { updatedAt: "desc" },
  });

  return jobs.map((job) => toDto(job, context.workerId));
}

export async function getJob(context: WorkerContext, jobId: string) {
  const job = await findJobOrThrow(jobId);
  const dto = toDto(job, context.workerId);

  // The installer's photo is what a verifier is asked to judge, so it is shown
  // to them and to the installer who took it, and to nobody else.
  if (job.installerId === context.workerId || job.verifierId === context.workerId) {
    const proof = await getPrismaClient().placementProof.findFirst({
      where: {
        jobId,
        role: PlacementJobRole.INSTALLER,
        photoPath: { not: null },
      },
      orderBy: { capturedAt: "desc" },
      select: { photoPath: true },
    });

    dto.proofPhotoUrl = proof?.photoPath
      ? await createProofViewUrl(proof.photoPath)
      : null;
  }

  return dto;
}

export async function acceptPlacement(context: WorkerContext, jobId: string) {
  const prisma = getPrismaClient();

  const job = await prisma.$transaction(async (transaction) => {
    const active = await transaction.placementJob.count({
      where: {
        installerId: context.workerId,
        status: PlacementJobStatus.ACCEPTED,
      },
    });

    if (active > 0) {
      throw new ApiError(
        409,
        "ALREADY_HOLDING_JOB",
        "Finish the placement you already accepted first.",
      );
    }

    // Conditional update: whoever commits first wins, and the loser sees zero
    // rows changed rather than overwriting the winner.
    const claimed = await transaction.placementJob.updateMany({
      where: {
        id: jobId,
        status: PlacementJobStatus.OPEN,
        installerId: null,
      },
      data: {
        status: PlacementJobStatus.ACCEPTED,
        installerId: context.workerId,
        acceptedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      throw new ApiError(
        409,
        "JOB_ALREADY_TAKEN",
        "Someone else accepted this job first.",
      );
    }

    return transaction.placementJob.findUniqueOrThrow({
      where: { id: jobId },
      include: jobInclude,
    });
  });

  return toDto(job, context.workerId);
}

export async function submitProof(
  context: WorkerContext,
  jobId: string,
  proof: { photoPath?: string; latitude?: number; longitude?: number },
) {
  const prisma = getPrismaClient();

  if (!proof.photoPath) {
    throw new ApiError(
      422,
      "PHOTO_REQUIRED",
      "Attach a photo of the poster before submitting.",
    );
  }

  // The client only reports a path; confirm the bytes actually landed.
  if (!(await proofObjectExists(proof.photoPath))) {
    throw new ApiError(
      422,
      "PHOTO_NOT_UPLOADED",
      "Your photo did not finish uploading. Please try again.",
    );
  }

  const job = await prisma.$transaction(async (transaction) => {
    if (proof.latitude !== undefined && proof.longitude !== undefined) {
      const target = await transaction.placementJob.findUnique({
        where: { id: jobId },
        select: { location: { select: { latitude: true, longitude: true } } },
      });

      if (target) {
        const metres = distanceInMetres(
          { latitude: proof.latitude, longitude: proof.longitude },
          target.location,
        );

        if (metres > proofRadiusMetres) {
          throw new ApiError(
            422,
            "OUTSIDE_GEOFENCE",
            "You are too far from the venue to submit proof.",
            { metresAway: Math.round(metres), allowedMetres: proofRadiusMetres },
          );
        }
      }
    }

    const updated = await transaction.placementJob.updateMany({
      where: {
        id: jobId,
        status: PlacementJobStatus.ACCEPTED,
        installerId: context.workerId,
      },
      data: {
        status: PlacementJobStatus.AWAITING_CHECK,
        proofAt: new Date(),
      },
    });

    if (updated.count === 0) {
      throw new ApiError(
        409,
        "JOB_NOT_AWAITING_PROOF",
        "This job is not waiting for your proof.",
      );
    }

    await transaction.placementProof.create({
      data: {
        jobId,
        submittedById: context.workerId,
        role: PlacementJobRole.INSTALLER,
        photoPath: proof.photoPath ?? null,
        latitude: proof.latitude ?? null,
        longitude: proof.longitude ?? null,
      },
    });

    return transaction.placementJob.findUniqueOrThrow({
      where: { id: jobId },
      include: jobInclude,
    });
  });

  return toDto(job, context.workerId);
}

export async function acceptCheck(context: WorkerContext, jobId: string) {
  const prisma = getPrismaClient();

  const job = await prisma.$transaction(async (transaction) => {
    const claimed = await transaction.placementJob.updateMany({
      where: {
        id: jobId,
        status: PlacementJobStatus.AWAITING_CHECK,
        verifierId: null,
        // The rule that matters: never your own placement.
        installerId: { not: context.workerId },
      },
      data: {
        status: PlacementJobStatus.CHECK_ACCEPTED,
        verifierId: context.workerId,
        checkAcceptedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      const existing = await transaction.placementJob.findUnique({
        where: { id: jobId },
        select: { installerId: true },
      });

      if (existing?.installerId === context.workerId) {
        throw new ApiError(
          403,
          "CANNOT_CHECK_OWN_PLACEMENT",
          "A different person has to check your placement.",
        );
      }

      throw new ApiError(
        409,
        "CHECK_UNAVAILABLE",
        "This check is no longer available.",
      );
    }

    return transaction.placementJob.findUniqueOrThrow({
      where: { id: jobId },
      include: jobInclude,
    });
  });

  return toDto(job, context.workerId);
}

/**
 * Confirms a placement and pays both workers from the campaign's held funds.
 *
 * Payouts are written in the same transaction as the status change, and the
 * ledger's unique (jobId, kind) constraint means a repeated call cannot pay
 * twice even if it races.
 */
export async function confirmPlacement(context: WorkerContext, jobId: string) {
  const prisma = getPrismaClient();

  const job = await prisma.$transaction(async (transaction) => {
    const confirmed = await transaction.placementJob.updateMany({
      where: {
        id: jobId,
        status: PlacementJobStatus.CHECK_ACCEPTED,
        verifierId: context.workerId,
      },
      data: {
        status: PlacementJobStatus.VERIFIED,
        checkedAt: new Date(),
      },
    });

    if (confirmed.count === 0) {
      throw new ApiError(
        409,
        "CHECK_NOT_YOURS",
        "This check is not assigned to you.",
      );
    }

    const current = await transaction.placementJob.findUniqueOrThrow({
      where: { id: jobId },
      include: jobInclude,
    });

    await transaction.placementProof.create({
      data: {
        jobId,
        submittedById: context.workerId,
        role: PlacementJobRole.VERIFIER,
      },
    });

    if (current.installerId) {
      await recordEntry(transaction, {
        kind: LedgerEntryKind.INSTALLER_PAYOUT,
        amountMinor: -current.installerFeeMinor,
        campaignId: current.campaignId,
        jobId,
        workerId: current.installerId,
        currency: current.currency,
        memo: "Placement confirmed",
      });
    }

    await recordEntry(transaction, {
      kind: LedgerEntryKind.VERIFIER_PAYOUT,
      amountMinor: -current.verifierFeeMinor,
      campaignId: current.campaignId,
      jobId,
      workerId: context.workerId,
      currency: current.currency,
      memo: "Check completed",
    });

    return current;
  });

  return toDto(job, context.workerId);
}

/** Rejects a placement and returns the held money to the campaign. */
export async function rejectPlacement(
  context: WorkerContext,
  jobId: string,
  reason?: string,
) {
  const prisma = getPrismaClient();

  const job = await prisma.$transaction(async (transaction) => {
    const rejected = await transaction.placementJob.updateMany({
      where: {
        id: jobId,
        status: PlacementJobStatus.CHECK_ACCEPTED,
        verifierId: context.workerId,
      },
      data: {
        status: PlacementJobStatus.REJECTED,
        checkedAt: new Date(),
        rejectionReason: reason ?? null,
      },
    });

    if (rejected.count === 0) {
      throw new ApiError(
        409,
        "CHECK_NOT_YOURS",
        "This check is not assigned to you.",
      );
    }

    const current = await transaction.placementJob.findUniqueOrThrow({
      where: { id: jobId },
      include: jobInclude,
    });

    await recordEntry(transaction, {
      kind: LedgerEntryKind.HOLD_RELEASE,
      amountMinor: current.installerFeeMinor + current.verifierFeeMinor,
      campaignId: current.campaignId,
      jobId,
      currency: current.currency,
      memo: "Placement rejected",
    });

    return current;
  });

  return toDto(job, context.workerId);
}

export async function getWallet(context: WorkerContext) {
  const prisma = getPrismaClient();
  const [earnedMinor, pending] = await Promise.all([
    workerEarnedMinor(prisma, context.workerId),
    prisma.placementJob.findMany({
      where: {
        status: {
          in: [
            PlacementJobStatus.ACCEPTED,
            PlacementJobStatus.AWAITING_CHECK,
            PlacementJobStatus.CHECK_ACCEPTED,
          ],
        },
        OR: [
          { installerId: context.workerId },
          { verifierId: context.workerId },
        ],
      },
      select: {
        installerId: true,
        installerFeeMinor: true,
        verifierFeeMinor: true,
      },
    }),
  ]);

  const pendingMinor = pending.reduce(
    (total, job) =>
      total +
      (job.installerId === context.workerId
        ? job.installerFeeMinor
        : job.verifierFeeMinor),
    BigInt(0),
  );

  const history = await prisma.ledgerEntry.findMany({
    where: {
      workerId: context.workerId,
      kind: {
        in: [LedgerEntryKind.INSTALLER_PAYOUT, LedgerEntryKind.VERIFIER_PAYOUT],
      },
    },
    include: {
      job: { include: { location: { select: { venueName: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return {
    earnedMinor: earnedMinor.toString(),
    pendingMinor: pendingMinor.toString(),
    currency: "USD",
    history: history.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      amountMinor: (entry.amountMinor < BigInt(0)
        ? -entry.amountMinor
        : entry.amountMinor
      ).toString(),
      venueName: entry.job?.location.venueName ?? null,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}
