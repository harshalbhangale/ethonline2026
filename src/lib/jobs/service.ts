import {
  CampaignStatus,
  JobRole,
  JobStatus,
  PlacementStatus,
  type Prisma,
} from "@/generated/prisma/client";
import type { WorkerContext } from "@/lib/auth/require-worker";
import { distanceInMetres } from "@/lib/campaigns/geo";
import { formatMinorUnits } from "@/lib/campaigns/money";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import type {
  NearbyJobDto,
  NearbyJobsResponse,
  WorkerEarningsResponse,
  WorkerJobDto,
  WorkerJobsResponse,
} from "@/lib/jobs/types";
import {
  activeJobStatuses,
  assertIndependentVerifier,
  assertJobTransition,
  assertPlacementTransition,
} from "@/lib/placements/state";

/** Campaign states in which physical work may be offered. */
const workableCampaignStatuses: CampaignStatus[] = [
  CampaignStatus.ASSETS_READY,
  CampaignStatus.DEPLOYING,
  CampaignStatus.VERIFYING,
  CampaignStatus.LIVE,
];

/** Placement state a job moves into when its worker starts. */
const startedPlacementStatus: Record<JobRole, PlacementStatus> = {
  INSTALLER: PlacementStatus.INSTALLING,
  VERIFIER: PlacementStatus.VERIFYING,
  CLEANUP: PlacementStatus.REMOVING,
};

/** Two decimals is about 1 km, so an open job never pinpoints the surface. */
function approximate(value: number) {
  return Math.round(value * 100) / 100;
}

function toIso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function jobUnavailable() {
  return new ApiError(404, "JOB_NOT_FOUND", "This job is no longer available.");
}

export async function listNearbyJobs(
  context: WorkerContext,
  origin: { latitude: number; longitude: number } | null,
): Promise<NearbyJobsResponse> {
  const prisma = getPrismaClient();
  const jobs = await prisma.job.findMany({
    where: {
      status: JobStatus.OPEN,
      campaign: {
        status: { in: workableCampaignStatuses },
        fundedAt: { not: null },
      },
      // A verifier job is never shown to the person who installed the placement.
      NOT: {
        role: JobRole.VERIFIER,
        placement: { installerUserId: context.userId },
      },
    },
    select: {
      id: true,
      role: true,
      rewardMinor: true,
      currency: true,
      createdAt: true,
      campaign: { select: { name: true, deadline: true } },
      placement: {
        select: {
          location: {
            select: {
              city: true,
              countryCode: true,
              latitude: true,
              longitude: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const nearby = jobs.map((job): NearbyJobDto => {
    const area = {
      city: job.placement.location.city,
      countryCode: job.placement.location.countryCode,
      latitude: approximate(job.placement.location.latitude),
      longitude: approximate(job.placement.location.longitude),
    };

    return {
      id: job.id,
      role: job.role,
      rewardMinor: job.rewardMinor.toString(),
      reward: formatMinorUnits(job.rewardMinor),
      currency: job.currency,
      campaign: {
        name: job.campaign.name,
        deadline: toIso(job.campaign.deadline),
      },
      area,
      // Measured to the approximate point, so distance cannot be used to
      // triangulate the exact surface either.
      distanceKm: origin
        ? Math.round(distanceInMetres(origin, area) / 100) / 10
        : null,
      createdAt: job.createdAt.toISOString(),
    };
  });

  if (origin) {
    nearby.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }

  return { jobs: nearby };
}

const workerJobSelect = {
  id: true,
  role: true,
  status: true,
  rewardMinor: true,
  currency: true,
  acceptedAt: true,
  startedAt: true,
  submittedAt: true,
  resolvedAt: true,
  paidAt: true,
  campaign: { select: { id: true, name: true } },
  placement: {
    select: {
      id: true,
      status: true,
      asset: { select: { shortCode: true } },
      location: {
        select: {
          venueName: true,
          city: true,
          latitude: true,
          longitude: true,
          placementInstructions: true,
          surfacePhotoUrl: true,
        },
      },
    },
  },
} satisfies Prisma.JobSelect;

type WorkerJobRecord = Prisma.JobGetPayload<{ select: typeof workerJobSelect }>;

function toWorkerJobDto(job: WorkerJobRecord): WorkerJobDto {
  return {
    id: job.id,
    role: job.role,
    status: job.status,
    rewardMinor: job.rewardMinor.toString(),
    reward: formatMinorUnits(job.rewardMinor),
    currency: job.currency,
    campaign: job.campaign,
    placement: { id: job.placement.id, status: job.placement.status },
    asset: job.placement.asset,
    location: job.placement.location,
    acceptedAt: toIso(job.acceptedAt),
    startedAt: toIso(job.startedAt),
    submittedAt: toIso(job.submittedAt),
    resolvedAt: toIso(job.resolvedAt),
    paidAt: toIso(job.paidAt),
  };
}

export async function getWorkerJob(
  context: WorkerContext,
  jobId: string,
): Promise<WorkerJobDto> {
  const job = await getPrismaClient().job.findFirst({
    where: { id: jobId, workerUserId: context.userId },
    select: workerJobSelect,
  });

  if (!job) throw jobUnavailable();
  return toWorkerJobDto(job);
}

export async function listWorkerJobs(
  context: WorkerContext,
): Promise<WorkerJobsResponse> {
  const jobs = await getPrismaClient().job.findMany({
    where: { workerUserId: context.userId },
    select: workerJobSelect,
    orderBy: { updatedAt: "desc" },
  });

  return { jobs: jobs.map(toWorkerJobDto) };
}

/**
 * A worker can hold this many jobs at once before Find work is blocked.
 *
 * Not unlimited: each accept reveals a placement's exact location, so an
 * unbounded queue would let one account sit on every open job in a city.
 * Five is enough to batch a morning's route without emptying the board.
 */
const MAX_ACTIVE_JOBS = 5;

/**
 * Claims an open job for the caller.
 *
 * Enforces, on the server: at most MAX_ACTIVE_JOBS active jobs per worker, no
 * verifying your own installation, and first-come acceptance when two
 * workers race for the same job.
 */
export async function acceptJob(
  context: WorkerContext,
  jobId: string,
): Promise<WorkerJobDto> {
  const prisma = getPrismaClient();

  await prisma.$transaction(async (transaction) => {
    // Serialise this worker's accepts so parallel requests cannot both pass
    // the one-active-job check.
    await transaction.$queryRaw`SELECT 1 FROM "worker_profiles" WHERE "user_id" = ${context.userId} FOR UPDATE`;

    const job = await transaction.job.findUnique({
      where: { id: jobId },
      include: {
        placement: { select: { id: true, installerUserId: true, verificationMode: true } },
        campaign: { select: { status: true, fundedAt: true } },
      },
    });

    if (
      !job ||
      !job.campaign.fundedAt ||
      !workableCampaignStatuses.includes(job.campaign.status)
    ) {
      throw jobUnavailable();
    }

    // SELF mode lets the installer also take the independent check; only
    // INDEPENDENT mode requires a different worker.
    if (job.role === JobRole.VERIFIER && job.placement.verificationMode !== "SELF") {
      assertIndependentVerifier(job.placement.installerUserId, context.userId);
    }

    if (job.status !== JobStatus.OPEN) {
      throw new ApiError(
        409,
        "JOB_UNAVAILABLE",
        "This job has already been taken.",
      );
    }

    const active = await transaction.job.count({
      where: { workerUserId: context.userId, status: { in: activeJobStatuses } },
    });

    if (active >= MAX_ACTIVE_JOBS) {
      throw new ApiError(
        409,
        "ACTIVE_JOB_LIMIT",
        `You can hold up to ${MAX_ACTIVE_JOBS} jobs at once. Finish one before accepting another.`,
      );
    }

    const claimed = await transaction.job.updateMany({
      where: { id: jobId, status: JobStatus.OPEN },
      data: {
        status: JobStatus.ACCEPTED,
        workerUserId: context.userId,
        acceptedAt: new Date(),
      },
    });

    if (claimed.count !== 1) {
      throw new ApiError(
        409,
        "JOB_UNAVAILABLE",
        "Another worker accepted this job first.",
      );
    }

    if (job.role === JobRole.INSTALLER) {
      await transaction.placement.update({
        where: { id: job.placement.id },
        data: { installerUserId: context.userId },
      });
    } else if (job.role === JobRole.VERIFIER && job.placement.installerUserId !== context.userId) {
      // A self-verifying installer stays null here (DB constraint forbids
      // installer_user_id = verifier_user_id); the escrow uses the installer's
      // own wallet for both roles at settlement instead.
      await transaction.placement.update({
        where: { id: job.placement.id },
        data: { verifierUserId: context.userId },
      });
    }
  });

  return getWorkerJob(context, jobId);
}

/** Marks an accepted job as underway, or resumes one after a recapture request. */
export async function startJob(
  context: WorkerContext,
  jobId: string,
): Promise<WorkerJobDto> {
  const prisma = getPrismaClient();

  await prisma.$transaction(async (transaction) => {
    const job = await transaction.job.findFirst({
      where: { id: jobId, workerUserId: context.userId },
      include: { placement: { select: { id: true, status: true } } },
    });

    if (!job) throw jobUnavailable();

    assertJobTransition(job.status, JobStatus.IN_PROGRESS);

    // A recapture resumes work without moving the placement back.
    if (job.status === JobStatus.ACCEPTED) {
      const target = startedPlacementStatus[job.role];
      assertPlacementTransition(job.placement.status, target);

      const moved = await transaction.placement.updateMany({
        where: { id: job.placement.id, status: job.placement.status },
        data: { status: target },
      });

      if (moved.count !== 1) {
        throw new ApiError(409, "PLACEMENT_CHANGED", "This placement changed. Refresh and try again.");
      }
    }

    const started = await transaction.job.updateMany({
      where: { id: jobId, status: job.status, workerUserId: context.userId },
      data: { status: JobStatus.IN_PROGRESS, startedAt: new Date() },
    });

    if (started.count !== 1) {
      throw new ApiError(409, "JOB_CHANGED", "This job changed. Refresh and try again.");
    }
  });

  return getWorkerJob(context, jobId);
}

export async function getWorkerEarnings(
  context: WorkerContext,
): Promise<WorkerEarningsResponse> {
  const jobs = await getPrismaClient().job.findMany({
    where: {
      workerUserId: context.userId,
      status: { in: [JobStatus.ACCEPTED_PROOF, JobStatus.PAID] },
    },
    select: { status: true, rewardMinor: true },
  });

  const zero = BigInt(0);
  const paid = jobs
    .filter((job) => job.status === JobStatus.PAID)
    .reduce((total, job) => total + job.rewardMinor, zero);
  const pending = jobs
    .filter((job) => job.status === JobStatus.ACCEPTED_PROOF)
    .reduce((total, job) => total + job.rewardMinor, zero);

  return {
    // Campaigns are single-currency USD until onchain escrow settles in USDC.
    currency: "USD",
    paidMinor: paid.toString(),
    paid: formatMinorUnits(paid),
    pendingMinor: pending.toString(),
    pending: formatMinorUnits(pending),
    completedJobs: jobs.filter((job) => job.status === JobStatus.PAID).length,
  };
}
