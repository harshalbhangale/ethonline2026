import {
  CampaignStatus,
  JobRole,
  JobStatus,
  PlacementStatus,
} from "@/generated/prisma/client";
import type { BrandContext } from "@/lib/auth/require-brand";
import { perPlacementMinor } from "@/lib/campaigns/pricing";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import {
  listCampaignPlacements,
  openInstallationJobs,
} from "@/lib/placements/service";
import type { PlacementListResponse } from "@/lib/placements/types";
import {
  assertJobTransition,
  assertPlacementTransition,
} from "@/lib/placements/state";

/**
 * Development-only shortcuts for rehearsing the demo without an admin product.
 *
 * Off unless NEXT_PUBLIC_DEMO_MODE is "true". Every action still requires the
 * caller to own the campaign.
 */
export function isDemoMode() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export const demoActions = [
  "mark-printing-complete",
  "simulate-installer-proof",
  "reset-placements",
] as const;

export type DemoAction = (typeof demoActions)[number];

export async function runDemoAction(
  context: BrandContext,
  campaignId: string,
  action: DemoAction,
): Promise<PlacementListResponse> {
  if (!isDemoMode()) {
    throw new ApiError(404, "NOT_FOUND", "Not found.");
  }

  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organizationId },
    select: { id: true, status: true, currency: true },
  });

  if (!campaign) {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
  }

  if (action === "mark-printing-complete") {
    if (campaign.status !== CampaignStatus.ASSETS_READY) {
      throw new ApiError(
        409,
        "DEMO_ACTION_UNAVAILABLE",
        "Printing can only be completed while assets are ready.",
      );
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.DEPLOYING },
    });
  }

  if (action === "simulate-installer-proof") {
    // Stands in for evidence upload and deterministic pre-checks until they
    // exist: the installer's proof "passes" and a verifier job opens.
    await prisma.$transaction(async (transaction) => {
      const placements = await transaction.placement.findMany({
        where: { campaignId, status: PlacementStatus.INSTALLING },
        include: { jobs: { where: { role: JobRole.INSTALLER } } },
      });

      if (placements.length === 0) {
        throw new ApiError(
          409,
          "DEMO_ACTION_UNAVAILABLE",
          "No placement is being installed. Accept and start an installer job first.",
        );
      }

      const now = new Date();

      for (const placement of placements) {
        const installerJob = placement.jobs[0];
        if (!installerJob) continue;

        assertJobTransition(installerJob.status, JobStatus.PROOF_SUBMITTED);
        assertPlacementTransition(placement.status, PlacementStatus.INSTALL_SUBMITTED);
        assertPlacementTransition(
          PlacementStatus.INSTALL_SUBMITTED,
          PlacementStatus.AWAITING_VERIFIER,
        );

        await transaction.job.update({
          where: { id: installerJob.id },
          data: { status: JobStatus.PROOF_SUBMITTED, submittedAt: now },
        });

        await transaction.placement.update({
          where: { id: placement.id },
          data: { status: PlacementStatus.AWAITING_VERIFIER, installedAt: now },
        });
      }

      await transaction.job.createMany({
        data: placements.map((placement) => ({
          placementId: placement.id,
          campaignId,
          role: JobRole.VERIFIER,
          rewardMinor: BigInt(perPlacementMinor.verification),
          currency: campaign.currency,
        })),
        skipDuplicates: true,
      });
    });
  }

  if (action === "reset-placements") {
    await prisma.$transaction([
      prisma.job.deleteMany({ where: { campaignId } }),
      prisma.placement.deleteMany({ where: { campaignId } }),
      prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.ASSETS_READY },
      }),
    ]);

    await openInstallationJobs(campaignId);
  }

  return listCampaignPlacements(context, campaignId);
}
