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
import { ensurePayoutWallet } from "@/lib/jobs/worker-view";
import { LANDING_EVENT } from "@/lib/assets/conversions";
import { assignPlacementWorkers } from "@/lib/onchain/placements";
import {
  listCampaignPlacements,
  openInstallationJobs,
} from "@/lib/placements/service";
import type { PlacementListResponse } from "@/lib/placements/types";
import { isMockVerificationEnabled, runMockVerification } from "@/lib/verification/mock-verify";
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
  "generate-activity",
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
  // Clear of the lenient geofence even at its widest (radius doubled for
  // GPS accuracy, so up to 6 km) — the fraud demo has to stay outside it.
  const offset = fraudulent ? 0.07 : 0; // about 7.7 km
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

/** A short approach to the venue, ending two minutes on site. */
async function recordTrail(
  placement: PlacementWithContext,
  jobId: string,
  workerUserId: string,
  fraudulent: boolean,
) {
  const now = Date.now();
  const offset = fraudulent ? 0.07 : 0;
  await getPrismaClient().locationPing.createMany({
    data: Array.from({ length: 12 }, (_, index) => ({
      placementId: placement.id,
      jobId,
      workerUserId,
      latitude: placement.location.latitude + offset + Math.max(0, 6 - index) * 0.0006,
      longitude: placement.location.longitude,
      accuracyMeters: 8,
      recordedAt: new Date(now - (13 - index) * 10_000),
    })),
  });
}

/** Payout wallets into escrow, then the confidential check. */
async function settle(placementId: string, workerUserIds: string[], appUrl: string) {
  if (!isOnchainConfigured()) return;
  for (const userId of workerUserIds) await ensurePayoutWallet(userId);
  await assignPlacementWorkers(placementId);
  if (isMockVerificationEnabled()) {
    await runMockVerification(placementId);
  } else {
    await startVerificationRun(placementId, appUrl);
  }
}

/**
 * Scans, visitors, landings and signups for every poster that is up, shaped
 * like real traffic: most scanners land, a few sign up.
 */
async function generateActivity(campaignId: string) {
  const prisma = getPrismaClient();
  const placements = await prisma.placement.findMany({
    where: { campaignId, status: { in: [PlacementStatus.VERIFIED, PlacementStatus.REMOVING, PlacementStatus.REMOVED] } },
    select: { assetId: true, location: { select: { city: true } } },
  });
  if (placements.length === 0) {
    throw new ApiError(409, "DEMO_ACTION_UNAVAILABLE", "No poster is up yet.");
  }

  const now = Date.now();
  let scans = 0;
  for (const placement of placements) {
    const visitors = 8 + Math.floor(Math.random() * 30);
    for (let visitor = 0; visitor < visitors; visitor++) {
      const sessionHash = randomBytes(16).toString("hex");
      const repeat = Math.random() < 0.25 ? 2 : 1;
      for (let visit = 0; visit < repeat; visit++) {
        const scan = await prisma.scanEvent.create({
          data: {
            assetId: placement.assetId,
            campaignId,
            sessionHash,
            userAgentHash: randomBytes(16).toString("hex"),
            coarseRegion: placement.location.city,
            createdAt: new Date(now - Math.floor(Math.random() * 6 * 3_600_000)),
          },
        });
        scans++;
        if (visit > 0 || Math.random() > 0.78) continue;
        await prisma.conversionEvent.create({
          data: { scanEventId: scan.id, assetId: placement.assetId, campaignId, name: LANDING_EVENT, createdAt: scan.createdAt },
        });
        if (Math.random() < 0.18) {
          await prisma.conversionEvent.create({
            data: { scanEventId: scan.id, assetId: placement.assetId, campaignId, name: "signup", createdAt: new Date(scan.createdAt.getTime() + 60_000) },
          });
        }
      }
    }
  }
  return `${scans} scans recorded across ${placements.length} poster${placements.length === 1 ? "" : "s"}.`;
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

    case PlacementStatus.INSTALLING: {
      // The walk to the venue, as the Worker PWA would have streamed it.
      await recordTrail(placement, jobFor(placement, JobRole.INSTALLER).id, installer.userId, fraudulent);
      await submitProof(placement, JobRole.INSTALLER, installer, fraudulent);
      if (placement.verificationMode === "INDEPENDENT") {
        return "Installer proof submitted. An independent check is open.";
      }
      await settle(placement.id, [installer.userId], appUrl);
      return fraudulent
        ? "Stuck and verified from about 2 km away. Chainlink CRE is checking it now."
        : "Stuck and verified on site. Chainlink CRE is checking it now; it takes about a minute.";
    }

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
      await settle(placement.id, [installer.userId, verifier.userId], appUrl);
      return "Spot check confirmed. Chainlink CRE is checking both proofs now.";

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
        if (job.role === JobRole.INSTALLER) await recordTrail(placement, job.id, worker.userId, false);
        await submitProof(placement, job.role, worker, false);
      }
      const after = await prisma.placement.findUniqueOrThrow({ where: { id: placement.id } });
      if (after.status === PlacementStatus.READY_FOR_FINAL_VERIFICATION) {
        await settle(placement.id, [installer.userId, verifier.userId], appUrl);
        return "Fresh proof captured at the venue. Chainlink CRE is checking it again.";
      }
      return "Fresh proof captured at the venue.";
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

  if (input.action === "generate-activity") {
    message = await generateActivity(campaignId);
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
