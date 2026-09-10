import { randomUUID } from "node:crypto";
import { CampaignStatus } from "@/generated/prisma/client";
import { generateCampaignAssets } from "@/lib/assets/service";
import type { BrandContext } from "@/lib/auth/require-brand";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import { capacityHoldingStatuses } from "@/lib/locations/service";
import { approveCampaignQuote, assertQuoteReady } from "@/lib/quotes/service";
import type { CampaignAssetDto } from "@/lib/assets/types";
import type { CampaignQuoteDto } from "@/lib/quotes/types";

export type FundCampaignResult = {
  quote: CampaignQuoteDto;
  assets: CampaignAssetDto[];
  /** Always true in Phase 2. Real escrow arrives in Phase 4. */
  mocked: true;
  fundingReference: string;
};

/**
 * Phase 2 funding. This moves no money.
 *
 * It exists so the rest of the pipeline (asset generation, worker jobs) can be
 * built and demonstrated before onchain escrow lands in Phase 4. The response
 * says `mocked: true` so no caller can mistake it for a real payment.
 */
export async function fundCampaign(
  context: BrandContext,
  campaignId: string,
  appUrl: string,
): Promise<FundCampaignResult> {
  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organizationId },
  });

  if (!campaign) {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
  }

  if (campaign.fundedAt !== null) {
    throw new ApiError(
      409,
      "CAMPAIGN_ALREADY_FUNDED",
      "This campaign is already funded.",
    );
  }

  if (
    campaign.status !== CampaignStatus.DRAFT &&
    campaign.status !== CampaignStatus.QUOTED
  ) {
    throw new ApiError(
      409,
      "CAMPAIGN_NOT_FUNDABLE",
      "Only draft or quoted campaigns can be funded.",
    );
  }

  assertQuoteReady(campaign);

  // Drafts do not reserve inventory, so capacity has to be proven here. This is
  // the point where the campaign actually claims its venues.
  const assignments = await prisma.campaignLocation.findMany({
    where: { campaignId },
    include: { location: true },
  });

  if (assignments.length === 0) {
    throw new ApiError(
      409,
      "NO_ASSIGNED_LOCATIONS",
      "Assign approved locations before funding.",
    );
  }

  const conflicts: string[] = [];

  for (const assignment of assignments) {
    if (assignment.location.permissionStatus !== "APPROVED") {
      conflicts.push(assignment.location.venueName);
      continue;
    }

    const held = await prisma.campaignLocation.count({
      where: {
        locationId: assignment.locationId,
        campaignId: { not: campaignId },
        campaign: { status: { in: capacityHoldingStatuses } },
      },
    });

    if (held >= assignment.location.maxActiveCampaigns) {
      conflicts.push(assignment.location.venueName);
    }
  }

  if (conflicts.length > 0) {
    throw new ApiError(
      409,
      "LOCATION_CAPACITY_EXCEEDED",
      "Some approved locations were taken while this campaign was being prepared. Reselect the campaign area.",
      { venues: conflicts },
    );
  }

  const quote = await approveCampaignQuote(context, campaignId);
  const fundingReference = `mock-${randomUUID()}`;

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: CampaignStatus.FUNDED,
      fundedAt: new Date(),
      fundingReference,
    },
  });

  // Assets can only be issued once funding is committed, and generation moves
  // the campaign on to ASSETS_READY.
  const assets = await generateCampaignAssets(context, campaignId, appUrl);

  return { quote, assets, mocked: true, fundingReference };
}
