import {
  CampaignStatus,
  QuoteStatus,
  type Campaign,
  type CampaignQuote,
  type CampaignQuoteLineItem,
} from "@/generated/prisma/client";
import type { BrandContext } from "@/lib/auth/require-brand";
import { formatMinorUnits } from "@/lib/campaigns/money";
import { computeQuote } from "@/lib/campaigns/pricing";
import { campaignQuoteReadySchema } from "@/lib/campaigns/schemas";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import type { CampaignQuoteDto } from "@/lib/quotes/types";

type QuoteWithLineItems = CampaignQuote & {
  lineItems: CampaignQuoteLineItem[];
};

/**
 * The DRAFT -> QUOTED trust boundary.
 *
 * The database allows incomplete drafts so the wizard can save each step, so
 * this is the only place that proves a campaign is complete enough to be priced
 * and committed. It reports every missing field at once rather than one at a
 * time.
 */
export function assertQuoteReady(campaign: Campaign) {
  const result = campaignQuoteReadySchema.safeParse({
    placementCount: campaign.placementCount,
    budgetLimitMinor: campaign.budgetLimitMinor,
    destinationUrl: campaign.destinationUrl,
    deadline: campaign.deadline,
    countryCode: campaign.countryCode,
    countryName: campaign.countryName,
    city: campaign.city,
    centerLatitude: campaign.centerLatitude,
    centerLongitude: campaign.centerLongitude,
    radiusMeters: campaign.radiusMeters,
    locationStrategy: campaign.locationStrategy,
  });

  if (!result.success) {
    throw new ApiError(
      409,
      "CAMPAIGN_INCOMPLETE",
      "This campaign is missing details needed to produce a quote.",
      { fields: result.error.flatten().fieldErrors },
    );
  }

  return result.data;
}

function toQuoteDto(
  quote: QuoteWithLineItems,
  campaign: Campaign,
  assignedLocationCount: number,
): CampaignQuoteDto {
  const lineItems = [...quote.lineItems].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const subtotalMinor = lineItems
    .filter((item) => item.kind !== "CONTINGENCY")
    .reduce((total, item) => total + item.amountMinor, BigInt(0));

  const exceedsBudget =
    campaign.budgetLimitMinor !== null &&
    quote.totalMinor > campaign.budgetLimitMinor;

  return {
    id: quote.id,
    campaignId: quote.campaignId,
    version: quote.version,
    status: quote.status,
    currency: quote.currency,

    lineItems: lineItems.map((item) => ({
      kind: item.kind,
      label: item.label,
      amountMinor: item.amountMinor.toString(),
      amount: formatMinorUnits(item.amountMinor),
      sortOrder: item.sortOrder,
    })),
    subtotalMinor: subtotalMinor.toString(),
    subtotal: formatMinorUnits(subtotalMinor),
    totalMinor: quote.totalMinor.toString(),
    total: formatMinorUnits(quote.totalMinor),

    pricedPlacementCount: assignedLocationCount,
    requestedPlacementCount: campaign.placementCount,
    assignedLocationCount,

    budgetLimitMinor: campaign.budgetLimitMinor?.toString() ?? null,
    budgetLimit:
      campaign.budgetLimitMinor === null
        ? null
        : formatMinorUnits(campaign.budgetLimitMinor),
    exceedsBudget,

    approvedAt: quote.approvedAt?.toISOString() ?? null,
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
  };
}

async function loadOwnedCampaign(
  context: BrandContext,
  campaignId: string,
): Promise<Campaign> {
  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organizationId },
  });

  if (!campaign) {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
  }

  return campaign;
}

/**
 * Prices the campaign and stores the result as a new quote version.
 *
 * Pricing is deterministic: the same placement count always produces the same
 * line items. The priced count is the number of approved locations actually
 * assigned, because that is what will be installed.
 */
export async function createCampaignQuote(
  context: BrandContext,
  campaignId: string,
): Promise<CampaignQuoteDto> {
  const prisma = getPrismaClient();
  const campaign = await loadOwnedCampaign(context, campaignId);

  if (campaign.fundedAt !== null) {
    throw new ApiError(
      409,
      "QUOTE_IMMUTABLE",
      "This campaign is funded, so its quote can no longer change.",
    );
  }

  if (
    campaign.status !== CampaignStatus.DRAFT &&
    campaign.status !== CampaignStatus.QUOTED
  ) {
    throw new ApiError(
      409,
      "CAMPAIGN_NOT_QUOTABLE",
      "Only draft or quoted campaigns can be re-quoted.",
    );
  }

  assertQuoteReady(campaign);

  const assignedLocationCount = await prisma.campaignLocation.count({
    where: { campaignId },
  });

  if (assignedLocationCount === 0) {
    throw new ApiError(
      409,
      "NO_ASSIGNED_LOCATIONS",
      "Assign approved locations before requesting a quote.",
    );
  }

  const computed = computeQuote(assignedLocationCount, campaign.assetType);

  const quote = await prisma.$transaction(async (transaction) => {
    const latest = await transaction.campaignQuote.findFirst({
      where: { campaignId },
      orderBy: { version: "desc" },
      include: { lineItems: true },
    });

    // Re-requesting an unchanged quote must not churn versions.
    if (
      latest &&
      latest.status === QuoteStatus.DRAFT &&
      latest.totalMinor === BigInt(computed.totalMinor) &&
      latest.currency === campaign.currency &&
      latest.lineItems.length === computed.lines.length &&
      computed.lines.every((line) =>
        latest.lineItems.some(
          (item) =>
            item.kind === line.kind &&
            item.amountMinor === BigInt(line.amountMinor),
        ),
      )
    ) {
      return latest;
    }

    await transaction.campaignQuote.updateMany({
      where: { campaignId, status: { not: QuoteStatus.SUPERSEDED } },
      data: { status: QuoteStatus.SUPERSEDED, approvedAt: null },
    });

    return transaction.campaignQuote.create({
      data: {
        campaignId,
        version: (latest?.version ?? 0) + 1,
        status: QuoteStatus.DRAFT,
        currency: campaign.currency,
        totalMinor: BigInt(computed.totalMinor),
        lineItems: {
          create: computed.lines.map((line) => ({
            kind: line.kind,
            label: line.label,
            amountMinor: BigInt(line.amountMinor),
            sortOrder: line.sortOrder,
          })),
        },
      },
      include: { lineItems: true },
    });
  });

  // A superseded quote means the campaign is no longer committed to a price.
  if (campaign.status === CampaignStatus.QUOTED) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.DRAFT },
    });
  }

  return toQuoteDto(quote, campaign, assignedLocationCount);
}

export async function getLatestCampaignQuote(
  context: BrandContext,
  campaignId: string,
): Promise<CampaignQuoteDto> {
  const prisma = getPrismaClient();
  const campaign = await loadOwnedCampaign(context, campaignId);

  const quote = await prisma.campaignQuote.findFirst({
    where: { campaignId, status: { not: QuoteStatus.SUPERSEDED } },
    orderBy: { version: "desc" },
    include: { lineItems: true },
  });

  if (!quote) {
    throw new ApiError(404, "QUOTE_NOT_FOUND", "This campaign has no quote yet.");
  }

  const assignedLocationCount = await prisma.campaignLocation.count({
    where: { campaignId },
  });

  return toQuoteDto(quote, campaign, assignedLocationCount);
}

/**
 * Approves the current quote and moves the campaign to QUOTED.
 *
 * After funding the approved quote is immutable; a change requires a new
 * version, which is why approval is recorded on the quote row itself.
 */
export async function approveCampaignQuote(
  context: BrandContext,
  campaignId: string,
): Promise<CampaignQuoteDto> {
  const prisma = getPrismaClient();
  const campaign = await loadOwnedCampaign(context, campaignId);

  if (campaign.fundedAt !== null) {
    throw new ApiError(
      409,
      "QUOTE_IMMUTABLE",
      "This campaign is funded, so its quote can no longer change.",
    );
  }

  assertQuoteReady(campaign);

  const approved = await prisma.$transaction(async (transaction) => {
    const quote = await transaction.campaignQuote.findFirst({
      where: { campaignId, status: { not: QuoteStatus.SUPERSEDED } },
      orderBy: { version: "desc" },
      include: { lineItems: true },
    });

    if (!quote) {
      throw new ApiError(
        409,
        "QUOTE_REQUIRED",
        "Generate a quote before approving it.",
      );
    }

    const updated = await transaction.campaignQuote.update({
      where: { id: quote.id },
      data: {
        status: QuoteStatus.APPROVED,
        approvedAt: quote.approvedAt ?? new Date(),
      },
      include: { lineItems: true },
    });

    await transaction.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.QUOTED },
    });

    return updated;
  });

  const assignedLocationCount = await prisma.campaignLocation.count({
    where: { campaignId },
  });

  return toQuoteDto(approved, campaign, assignedLocationCount);
}
