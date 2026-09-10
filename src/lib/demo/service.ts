import { randomBytes } from "node:crypto";
import {
  CampaignStatus,
  JobRole,
  JobStatus,
  PlacementStatus,
  type Job,
  type Location,
  type Placement,
} from "@/generated/prisma/client";
import type { BrandContext } from "@/lib/auth/require-brand";
import { perPlacementMinor } from "@/lib/campaigns/pricing";
import { isOnchainConfigured } from "@/lib/chain/config";
import { getPrismaClient } from "@/lib/database/prisma";
import { ensureDemoWorkers, type DemoWorker } from "@/lib/demo/workers";
import { ApiError } from "@/lib/http/api-error";
import { acceptJob, startJob } from "@/lib/jobs/service";
import { assignPlacementWorkers } from "@/lib/onchain/placements";
import {
  listCampaignPlacements,
  openInstallationJobs,
} from "@/lib/placements/service";
import {
  assertJobTransition,
  assertPlacementTransition,
} from "@/lib/placements/state";
import type { PlacementListResponse } from "@/lib/placements/types";
import { startVerificationRun } from "@/lib/verification/runner";

/**
 * Development-only shortcuts for rehearsing the demo without the Worker PWA.
 *
 * Off unless NEXT_PUBLIC_DEMO_MODE is "true". Every action still requires the
 * caller to own the campaign, and every step goes through the same job rules,
 * onchain calls and confidential verification a real worker would trigger.
 */
export function isDemoMode() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export const demoActions = [
  "mark-printing-complete",
  "advance-placement",
  "reset-placements",
] as const;

export type DemoAction = (typeof demoActions)[number];

export type DemoActionInput = {
  action: DemoAction;
  placementId?: string;
  /** Submit proof from ~2 km away, to show the confidential check rejecting it. */
  fraudulent?: boolean;
};

export type DemoActionResult = PlacementListResponse & { message: string };

const challengeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomChallenge() {
  return Array.from(randomBytes(4), (byte) => challengeAlphabet[byte % challengeAlphabet.length]).join("");
}

type PlacementWithContext = Placement & {
  jobs: Job[];
  location: Location;
  asset: { shortCode: string };
  campaign: { currency: string };
};

/** Records one proof exactly as the Worker PWA would, then moves the job on. */
async function submitProof(
  placement: PlacementWithContext,
  role: JobRole,
  worker: DemoWorker,
  options: { fraudulent: boolean; movePlacement: boolean },
) {
  const now = Date.now();
  const jitter = () => (Math.random() - 0.5) * 0.0002; // about ±11 m
  const offset = options.fraudulent ? 0.02 : 0; // about 2.2 km
  const symbol = randomChallenge();

  await getPrismaClient().$transaction(async (transaction) => {
    const job = await transaction.job.findFirst({
      where: { placementId: placement.id, role, workerUserId: worker.userId },
    });
    if (!job) {
      throw new ApiError(409, "DEMO_ACTION_UNAVAILABLE", `No ${role.toLowerCase()} job is held by the demo worker.`);
    }

    assertJobTransition(job.status, JobStatus.PROOF_SUBMITTED);

    await transaction.evidence.create({
      data: {
        placementId: placement.id,
        jobId: job.id,
        role,
        workerUserId: worker.userId,
        scannedShortCode: placement.asset.shortCode,
        latitude: placement.location.latitude + offset + jitter(),
        longitude: placement.location.longitude + jitter(),
        accuracyMeters: 8,
        capturedAt: new Date(now - 20_000),
        challengeSymbol: symbol,
        challengeResponse: symbol,
        challengeIssuedAt: new Date(now - 90_000),
        challengeExpiresAt: new Date(now + 90_000),
        mediaHash: `0x${randomBytes(32).toString("hex")}`,
      },
    });

    await transaction.job.update({
      where: { id: job.id },
      data: { status: JobStatus.PROOF_SUBMITTED, submittedAt: new Date() },
    });

    if (!options.movePlacement) return;

    if (role === JobRole.INSTALLER) {
      assertPlacementTransition(placement.status, PlacementStatus.INSTALL_SUBMITTED);
      assertPlacementTransition(PlacementStatus.INSTALL_SUBMITTED, PlacementStatus.AWAITING_VERIFIER);
      await transaction.placement.update({
        where: { id: placement.id },
        data: { status: PlacementStatus.AWAITING_VERIFIER, installedAt: new Date() },
      });
      await transaction.job.createMany({
        data: [
          {
            placementId: placement.id,
            campaignId: placement.campaignId,
            role: JobRole.VERIFIER,
            rewardMinor: BigInt(perPlacementMinor.verification),
            currency: placement.campaign.currency,
          },
        ],
        skipDuplicates: true,
      });
    } else {
      assertPlacementTransition(placement.status, PlacementStatus.READY_FOR_FINAL_VERIFICATION);
      await transaction.placement.update({
        where: { id: placement.id },
        data: { status: PlacementStatus.READY_FOR_FINAL_VERIFICATION },
      });
    }
  });
}

function jobFor(placement: PlacementWithContext, role: JobRole) {
  const job = placement.jobs.find((item) => item.role === role);
  if (!job) {
    throw new ApiError(409, "DEMO_ACTION_UNAVAILABLE", `This placement has no ${role.toLowerCase()} job.`);
  }
  return job;
}

async function advancePlacement(
  campaignId: string,
  placementId: string,
  fraudulent: boolean,
  appUrl: string,
) {
  const prisma = getPrismaClient();
  const placement = await prisma.placement.findFirst({
    where: { id: placementId, campaignId },
    include: {
      jobs: true,
      location: true,
      asset: { select: { shortCode: true } },
      campaign: { select: { currency: true } },
    },
  });
  if (!placement) throw new ApiError(404, "PLACEMENT_NOT_FOUND", "Placement not found.");

  const { installer, verifier } = await ensureDemoWorkers();

  switch (placement.status) {
    case PlacementStatus.AWAITING_INSTALL: {
      const job = jobFor(placement, JobRole.INSTALLER);
      // Retrying after a partial failure: the job may already be ours.
      if (!(job.workerUserId === installer.userId && job.status === JobStatus.ACCEPTED)) {
        await acceptJob(installer, job.id);
      }
      await startJob(installer, job.id);
      return "The demo installer accepted the job; the exact location was revealed to them.";
    }

    case PlacementStatus.INSTALLING:
      await submitProof(placement, JobRole.INSTALLER, installer, { fraudulent, movePlacement: true });
      return fraudulent
        ? "Installer proof submitted from about 2 km away. An independent verifier job is open."
        : "Installer proof submitted. An independent verifier job is open.";

    case PlacementStatus.AWAITING_VERIFIER: {
      const job = jobFor(placement, JobRole.VERIFIER);
      if (!(job.workerUserId === verifier.userId && job.status === JobStatus.ACCEPTED)) {
        await acceptJob(verifier, job.id);
      }
      await startJob(verifier, job.id);
      return "A different worker accepted verification; the installer can never take this job.";
    }

    case PlacementStatus.VERIFYING:
      await submitProof(placement, JobRole.VERIFIER, verifier, { fraudulent, movePlacement: true });
      await assignPlacementWorkers(placement.id);
      return "Verifier proof submitted and both payout wallets recorded in escrow.";

    case PlacementStatus.READY_FOR_FINAL_VERIFICATION:
      if (!isOnchainConfigured()) {
        throw new ApiError(409, "DEMO_ACTION_UNAVAILABLE", "Confidential verification needs the escrow configured.");
      }
      await startVerificationRun(placement.id, appUrl);
      return "Chainlink CRE confidential verification started. It takes about a minute.";

    case PlacementStatus.NEEDS_RECAPTURE: {
      const rejected = placement.jobs.filter((job) => job.status === JobStatus.REJECTED_PROOF);
      if (rejected.length === 0) {
        throw new ApiError(409, "DEMO_ACTION_UNAVAILABLE", "No rejected proof to recapture.");
      }
      for (const job of rejected) {
        const worker = job.role === JobRole.INSTALLER ? installer : verifier;
        await startJob(worker, job.id);
        await submitProof(placement, job.role, worker, { fraudulent: false, movePlacement: false });
      }
      assertPlacementTransition(placement.status, PlacementStatus.READY_FOR_FINAL_VERIFICATION);
      await prisma.placement.update({
        where: { id: placement.id },
        data: { status: PlacementStatus.READY_FOR_FINAL_VERIFICATION },
      });
      return "Fresh proof recaptured at the approved surface. Run confidential verification again.";
    }

    default:
      throw new ApiError(409, "DEMO_ACTION_UNAVAILABLE", "Nothing left to simulate for this placement.");
  }
}

export async function runDemoAction(
  context: BrandContext,
  campaignId: string,
  input: DemoActionInput,
  appUrl: string,
): Promise<DemoActionResult> {
  if (!isDemoMode()) {
    throw new ApiError(404, "NOT_FOUND", "Not found.");
  }

  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organizationId },
    select: { id: true, status: true, escrowCampaignId: true },
  });

  if (!campaign) {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
  }

  let message = "Done.";

  if (input.action === "mark-printing-complete") {
    if (campaign.status !== CampaignStatus.ASSETS_READY) {
      throw new ApiError(409, "DEMO_ACTION_UNAVAILABLE", "Printing can only be completed while assets are ready.");
    }
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.DEPLOYING },
    });
    message = "Printing marked complete. Posters are ready for installers.";
  }

  if (input.action === "advance-placement") {
    if (!input.placementId) {
      throw new ApiError(400, "PLACEMENT_REQUIRED", "Choose a placement to advance.");
    }
    message = await advancePlacement(campaignId, input.placementId, Boolean(input.fraudulent), appUrl);
  }

  if (input.action === "reset-placements") {
    if (campaign.escrowCampaignId) {
      throw new ApiError(
        409,
        "DEMO_ACTION_UNAVAILABLE",
        "Placements of an escrow-funded campaign are registered onchain and cannot be reset. Create a new campaign instead.",
      );
    }

    await prisma.$transaction([
      prisma.job.deleteMany({ where: { campaignId } }),
      prisma.placement.deleteMany({ where: { campaignId } }),
      prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.ASSETS_READY },
      }),
    ]);
    await openInstallationJobs(campaignId);
    message = "Placements reset.";
  }

  return { ...(await listCampaignPlacements(context, campaignId)), message };
}
