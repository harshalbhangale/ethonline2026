import { randomUUID } from "node:crypto";
import {
  CampaignStatus,
  FundingRequestStatus,
  OrganizationRole,
} from "@/generated/prisma/client";
import type { Hex } from "viem";
import { generateCampaignAssets } from "@/lib/assets/service";
import type { CampaignAssetDto } from "@/lib/assets/types";
import type { BrandContext } from "@/lib/auth/require-brand";
import { formatMinorUnits } from "@/lib/campaigns/money";
import { campaignEscrowAbi } from "@/lib/chain/abis";
import { getPublicClient } from "@/lib/chain/client";
import { getChainConfig, isOnchainConfigured } from "@/lib/chain/config";
import { campaignEscrowKey } from "@/lib/chain/keys";
import { centsToTokenUnits, formatTokenUnits } from "@/lib/chain/units";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import { capacityHoldingStatuses } from "@/lib/locations/service";
import { registerCampaignPlacements } from "@/lib/onchain/placements";
import { approveCampaignQuote, assertQuoteReady } from "@/lib/quotes/service";
import type { CampaignQuoteDto } from "@/lib/quotes/types";
import {
  depositCampaignBudget,
  ensureOrganizationTreasury,
  readTokenSymbol,
  readTreasuryBalances,
} from "@/lib/treasury/service";

export type FundCampaignResult =
  | {
      status: "FUNDED";
      /** True only when no escrow is configured and no money moved. */
      mocked: boolean;
      quote: CampaignQuoteDto;
      assets: CampaignAssetDto[];
      fundingReference: string;
      txHash: string | null;
    }
  | {
      status: "PENDING_APPROVAL";
      quote: CampaignQuoteDto;
      fundingRequestId: string;
    };

const FUNDING_LOCK_PREFIX = "pending:";

async function assertFundable(context: BrandContext, campaignId: string) {
  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organizationId },
  });

  if (!campaign) {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
  }

  if (campaign.fundedAt !== null) {
    throw new ApiError(409, "CAMPAIGN_ALREADY_FUNDED", "This campaign is already funded.");
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
    throw new ApiError(409, "NO_ASSIGNED_LOCATIONS", "Assign approved locations before funding.");
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

  return campaign;
}

/** Used only when no escrow is configured. Moves no money. */
async function fundMocked(
  context: BrandContext,
  campaignId: string,
  appUrl: string,
  quote: CampaignQuoteDto,
): Promise<FundCampaignResult> {
  const fundingReference = `mock-${randomUUID()}`;
  await getPrismaClient().campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.FUNDED, fundedAt: new Date(), fundingReference },
  });

  const assets = await generateCampaignAssets(context, campaignId, appUrl);
  return { status: "FUNDED", mocked: true, quote, assets, fundingReference, txHash: null };
}

/**
 * Deposits the approved quote from the organization's Privy treasury into
 * CampaignEscrow, then issues assets and registers placements onchain.
 */
async function executeOnchainFunding(
  context: BrandContext,
  campaignId: string,
  amountMinor: bigint,
  appUrl: string,
  quote: CampaignQuoteDto,
): Promise<FundCampaignResult> {
  const prisma = getPrismaClient();
  const lock = `${FUNDING_LOCK_PREFIX}${randomUUID()}`;

  // Claim the campaign so a double click or a second approver cannot deposit twice.
  const claimed = await prisma.campaign.updateMany({
    where: {
      id: campaignId,
      organizationId: context.organizationId,
      fundedAt: null,
      fundingReference: null,
    },
    data: { fundingReference: lock },
  });

  if (claimed.count !== 1) {
    throw new ApiError(409, "FUNDING_IN_PROGRESS", "This campaign is already being funded.");
  }

  try {
    const config = getChainConfig();
    const treasury = await ensureOrganizationTreasury(context.organizationId);
    const amountUnits = centsToTokenUnits(amountMinor);
    const escrowKey = campaignEscrowKey(campaignId);

    // Recover from an earlier attempt whose deposit landed but was not saved.
    const [, alreadyFunded] = await getPublicClient().readContract({
      address: config.escrow,
      abi: campaignEscrowAbi,
      functionName: "campaigns",
      args: [escrowKey],
    });

    let txHash: string;
    if (alreadyFunded >= amountUnits) {
      const previous = await prisma.chainTransaction.findFirst({
        where: { campaignId, kind: "CAMPAIGN_FUND", status: "CONFIRMED" },
        orderBy: { createdAt: "desc" },
      });
      txHash = previous?.txHash ?? escrowKey;
    } else {
      const { tokenUnits } = await readTreasuryBalances(treasury.address);
      if (tokenUnits < amountUnits) {
        const symbol = await readTokenSymbol();
        throw new ApiError(
          409,
          "TREASURY_INSUFFICIENT",
          `Your treasury holds ${formatTokenUnits(tokenUnits)} ${symbol}; this campaign needs ${formatTokenUnits(amountUnits)} ${symbol}. Add funds to the treasury, then fund again.`,
          {
            requiredUnits: amountUnits.toString(),
            availableUnits: tokenUnits.toString(),
            treasuryAddress: treasury.address,
          },
        );
      }

      txHash = await depositCampaignBudget(treasury, campaignId, escrowKey as Hex, amountUnits);
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.FUNDED,
        fundedAt: new Date(),
        fundingReference: txHash,
        escrowCampaignId: escrowKey,
        escrowAddress: config.escrow,
        fundedAmountMinor: amountMinor,
      },
    });
  } catch (error) {
    await prisma.campaign.updateMany({
      where: { id: campaignId, fundingReference: lock },
      data: { fundingReference: null },
    });
    throw error;
  }

  const funded = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const assets = await generateCampaignAssets(context, campaignId, appUrl);

  try {
    await registerCampaignPlacements(campaignId);
  } catch (error) {
    // The deposit is safe in escrow; registration is retried by "Sync with chain".
    console.error("Placement registration failed after funding", error);
  }

  return {
    status: "FUNDED",
    mocked: false,
    quote,
    assets,
    fundingReference: funded.fundingReference ?? "",
    txHash: funded.fundingReference,
  };
}

export async function fundCampaign(
  context: BrandContext,
  campaignId: string,
  appUrl: string,
): Promise<FundCampaignResult> {
  await assertFundable(context, campaignId);
  const quote = await approveCampaignQuote(context, campaignId);

  if (!isOnchainConfigured()) {
    return fundMocked(context, campaignId, appUrl, quote);
  }

  const prisma = getPrismaClient();
  const amountMinor = BigInt(quote.totalMinor);
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: context.organizationId },
  });
  const threshold = organization.approvalThresholdMinor;

  if (threshold !== null && amountMinor > threshold) {
    const approvers = await prisma.organizationMember.count({
      where: {
        organizationId: context.organizationId,
        userId: { not: context.userId },
        role: { in: [OrganizationRole.BRAND, OrganizationRole.OPERATOR] },
      },
    });

    if (approvers === 0) {
      throw new ApiError(
        409,
        "APPROVER_REQUIRED",
        `Funding above ${formatMinorUnits(threshold)} needs a second approver. Invite a teammate or raise the threshold on the Treasury page.`,
      );
    }

    const existing = await prisma.fundingRequest.findFirst({
      where: { campaignId, status: FundingRequestStatus.PENDING },
    });
    const request =
      existing ??
      (await prisma.fundingRequest.create({
        data: {
          organizationId: context.organizationId,
          campaignId,
          amountMinor,
          requestedById: context.userId,
        },
      }));

    return { status: "PENDING_APPROVAL", quote, fundingRequestId: request.id };
  }

  return executeOnchainFunding(context, campaignId, amountMinor, appUrl, quote);
}

/** A second member approves a pending funding; the treasury then deposits. */
export async function approveFundingRequest(
  context: BrandContext,
  requestId: string,
  appUrl: string,
) {
  const prisma = getPrismaClient();
  const request = await prisma.fundingRequest.findFirst({
    where: { id: requestId, organizationId: context.organizationId },
  });

  if (!request) throw new ApiError(404, "FUNDING_REQUEST_NOT_FOUND", "Funding request not found.");
  if (request.requestedById === context.userId) {
    throw new ApiError(403, "SELF_APPROVAL", "A different member must approve this funding.");
  }

  const claimed = await prisma.fundingRequest.updateMany({
    where: { id: requestId, status: FundingRequestStatus.PENDING },
    data: {
      status: FundingRequestStatus.APPROVED,
      decidedById: context.userId,
      decidedAt: new Date(),
    },
  });
  if (claimed.count !== 1) {
    throw new ApiError(409, "FUNDING_REQUEST_DECIDED", "This request has already been decided.");
  }

  try {
    const quote = await approveCampaignQuote(context, request.campaignId);
    const result = await executeOnchainFunding(
      context,
      request.campaignId,
      request.amountMinor,
      appUrl,
      quote,
    );
    await prisma.fundingRequest.update({
      where: { id: requestId },
      data: { status: FundingRequestStatus.EXECUTED },
    });
    return result;
  } catch (error) {
    await prisma.fundingRequest.update({
      where: { id: requestId },
      data: {
        status: FundingRequestStatus.FAILED,
        failureReason: error instanceof Error ? error.message.slice(0, 500) : "Funding failed.",
      },
    });
    throw error;
  }
}

export async function rejectFundingRequest(context: BrandContext, requestId: string) {
  const prisma = getPrismaClient();
  const rejected = await prisma.fundingRequest.updateMany({
    where: {
      id: requestId,
      organizationId: context.organizationId,
      status: FundingRequestStatus.PENDING,
    },
    data: {
      status: FundingRequestStatus.REJECTED,
      decidedById: context.userId,
      decidedAt: new Date(),
    },
  });

  if (rejected.count !== 1) {
    throw new ApiError(409, "FUNDING_REQUEST_DECIDED", "This request is no longer pending.");
  }
}
