import {
  CampaignAssetStatus,
  JobRole,
  PlacementStatus,
  type Prisma,
} from "@/generated/prisma/client";
import type { BrandContext } from "@/lib/auth/require-brand";
import { formatMinorUnits } from "@/lib/campaigns/money";
import { perPlacementMinor } from "@/lib/campaigns/pricing";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import type {
  PlacementDto,
  PlacementListResponse,
  PlacementSummaryDto,
} from "@/lib/placements/types";

/**
 * Opens one placement and one installer job for every ready asset of a funded
 * campaign.
 *
 * Idempotent and safe under concurrent calls: existing placements and jobs are
 * skipped, so it can run after every asset generation, including retries. The
 * installer reward comes from the same rate card as the quote, so a job never
 * pays a different amount than the brand approved.
 */
export async function openInstallationJobs(campaignId: string) {
  const prisma = getPrismaClient();

  await prisma.$transaction(async (transaction) => {
    const campaign = await transaction.campaign.findUnique({
      where: { id: campaignId },
      select: { currency: true, fundedAt: true },
    });

    // Work is only offered once the money behind it is committed.
    if (!campaign?.fundedAt) return;

    const assets = await transaction.campaignAsset.findMany({
      where: {
        campaignId,
        status: CampaignAssetStatus.READY,
        locationId: { not: null },
        placement: null,
      },
      select: { id: true, locationId: true },
    });

    await transaction.placement.createMany({
      data: assets.flatMap((asset) =>
        asset.locationId
          ? [{ campaignId, assetId: asset.id, locationId: asset.locationId }]
          : [],
      ),
      skipDuplicates: true,
    });

    const withoutInstaller = await transaction.placement.findMany({
      where: { campaignId, jobs: { none: { role: JobRole.INSTALLER } } },
      select: { id: true },
    });

    await transaction.job.createMany({
      data: withoutInstaller.map((placement) => ({
        placementId: placement.id,
        campaignId,
        role: JobRole.INSTALLER,
        rewardMinor: BigInt(perPlacementMinor.installation),
        currency: campaign.currency,
      })),
      skipDuplicates: true,
    });
  });
}

const placementInclude = {
  campaign: { select: { id: true, name: true } },
  asset: { select: { shortCode: true, sequence: true } },
  location: { select: { id: true, venueName: true, city: true } },
  // Deliberately no worker fields: the brand sees progress, not people.
  jobs: {
    select: {
      role: true,
      status: true,
      rewardMinor: true,
      currency: true,
      acceptedAt: true,
      submittedAt: true,
      resolvedAt: true,
      paidAt: true,
    },
    orderBy: { role: "asc" },
  },
} satisfies Prisma.PlacementInclude;

type PlacementWithRelations = Prisma.PlacementGetPayload<{
  include: typeof placementInclude;
}>;

function toIso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function toPlacementDto(placement: PlacementWithRelations): PlacementDto {
  return {
    id: placement.id,
    campaign: placement.campaign,
    status: placement.status,
    asset: placement.asset,
    location: placement.location,
    jobs: placement.jobs.map((job) => ({
      role: job.role,
      status: job.status,
      rewardMinor: job.rewardMinor.toString(),
      reward: formatMinorUnits(job.rewardMinor),
      currency: job.currency,
      acceptedAt: toIso(job.acceptedAt),
      submittedAt: toIso(job.submittedAt),
      resolvedAt: toIso(job.resolvedAt),
      paidAt: toIso(job.paidAt),
    })),
    installedAt: toIso(placement.installedAt),
    verifiedAt: toIso(placement.verifiedAt),
    removedAt: toIso(placement.removedAt),
    createdAt: placement.createdAt.toISOString(),
    updatedAt: placement.updatedAt.toISOString(),
  };
}

const inProgressStatuses: PlacementStatus[] = [
  PlacementStatus.INSTALLING,
  PlacementStatus.INSTALL_SUBMITTED,
  PlacementStatus.NEEDS_RECAPTURE,
  PlacementStatus.AWAITING_VERIFIER,
  PlacementStatus.VERIFYING,
  PlacementStatus.READY_FOR_FINAL_VERIFICATION,
];

function summarize(placements: PlacementWithRelations[]): PlacementSummaryDto {
  const count = (statuses: PlacementStatus[]) =>
    placements.filter((placement) => statuses.includes(placement.status))
      .length;

  return {
    total: placements.length,
    awaitingInstall: count([PlacementStatus.AWAITING_INSTALL]),
    inProgress: count(inProgressStatuses),
    verified: count([PlacementStatus.VERIFIED, PlacementStatus.REMOVING]),
    removed: count([PlacementStatus.REMOVED]),
  };
}

function toListResponse(
  placements: PlacementWithRelations[],
): PlacementListResponse {
  return {
    placements: placements.map(toPlacementDto),
    summary: summarize(placements),
  };
}

export async function listCampaignPlacements(
  context: BrandContext,
  campaignId: string,
): Promise<PlacementListResponse> {
  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organizationId },
    select: { id: true },
  });

  if (!campaign) {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
  }

  const placements = await prisma.placement.findMany({
    where: { campaignId },
    include: placementInclude,
    orderBy: { asset: { sequence: "asc" } },
  });

  return toListResponse(placements);
}

export async function listOrganizationPlacements(
  context: BrandContext,
): Promise<PlacementListResponse> {
  const prisma = getPrismaClient();
  const placements = await prisma.placement.findMany({
    where: { campaign: { organizationId: context.organizationId } },
    include: placementInclude,
    orderBy: [{ createdAt: "desc" }, { asset: { sequence: "asc" } }],
  });

  return toListResponse(placements);
}
