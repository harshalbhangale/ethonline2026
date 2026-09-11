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
import { isOnchainConfigured } from "@/lib/chain/config";
import { getPrismaClient } from "@/lib/database/prisma";
import { ensureDemoWorkers, type DemoWorker } from "@/lib/demo/workers";
import { ApiError } from "@/lib/http/api-error";
import { recordProof } from "@/lib/jobs/proof";
import { acceptJob, startJob } from "@/lib/jobs/service";
import { assignPlacementWorkers } from "@/lib/onchain/placements";
import {
  listCampaignPlacements,
  openInstallationJobs,
} from "@/lib/placements/service";
import type { PlacementListResponse } from "@/lib/placements/types";
import { startVerificationRun } from "@/lib/verification/runner";

/**
 * Development-only shortcuts for rehearsing the demo without phones.
 *
 * Off unless NEXT_PUBLIC_DEMO_MODE is "true". Every action still requires the
 * caller to own the campaign, and every step goes through the same job rules,
 * proof recording, onchain calls and confidential verification as the Worker
 * PWA.
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
};

/** A proof as the Worker PWA would capture it, through the shared recorder. */
async function submitProof(
  placement: PlacementWithContext,
  role: JobRole,
  worker: DemoWorker,
  fraudulent: boolean,
) {
  const now = Date.now();
  const jitter = () => (Math.random() - 0.5) * 0.0002; // about ±11 m
  const offset = fraudulent ? 0.02 : 0; // about 2.2 km
  const symbol = randomChallenge();

  await recordProof(placement.id, role, worker.userId, {
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
      await submitProof(placement, JobRole.INSTALLER, installer, fraudulent);
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
      await submitProof(placement, JobRole.VERIFIER, verifier, fraudulent);
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
        await submitProof(placement, job.role, worker, false);
      }
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
