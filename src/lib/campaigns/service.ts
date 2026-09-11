import {
  CampaignStatus,
  type Campaign,
  type Prisma,
} from "@/generated/prisma/client";
import type { BrandContext } from "@/lib/auth/require-brand";
import type {
  CampaignCreateInput,
  CampaignUpdateInput,
} from "@/lib/campaigns/schemas";
import { formatMinorUnits } from "@/lib/campaigns/money";
import type { CampaignDto, CampaignListResponse } from "@/lib/campaigns/types";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";

/**
 * Builds the human-readable area label from structured geography.
 *
 * This is presentation only. Workers and quotes read the structured columns.
 */
export function buildAreaLabel(geography: {
  city: string | null;
  countryName: string | null;
  radiusMeters: number | null;
}): string | null {
  const place = [geography.city, geography.countryName]
    .filter((part): part is string => Boolean(part))
    .join(", ");

  if (!place) return null;
  if (!geography.radiusMeters) return place;

  const kilometres = geography.radiusMeters / 1000;
  const distance =
    kilometres >= 1
      ? `${Number.isInteger(kilometres) ? kilometres : kilometres.toFixed(1)} km`
      : `${geography.radiusMeters} m`;

  return `${distance} around ${place}`;
}

function toCampaignDto(campaign: Campaign): CampaignDto {
  return {
    id: campaign.id,
    organizationId: campaign.organizationId,
    name: campaign.name,
    briefText: campaign.briefText,
    status: campaign.status,
    wizardStep: campaign.wizardStep,
    currency: campaign.currency,

    placementCount: campaign.placementCount,
    budgetLimitMinor: campaign.budgetLimitMinor?.toString() ?? null,
    budgetLimit:
      campaign.budgetLimitMinor === null
        ? null
        : formatMinorUnits(campaign.budgetLimitMinor),
    destinationUrl: campaign.destinationUrl,
    deadline: campaign.deadline?.toISOString() ?? null,

    areaLabel: campaign.areaLabel,
    countryCode: campaign.countryCode,
    countryName: campaign.countryName,
    city: campaign.city,
    centerLatitude: campaign.centerLatitude,
    centerLongitude: campaign.centerLongitude,
    radiusMeters: campaign.radiusMeters,
    locationStrategy: campaign.locationStrategy,

    artworkUrl: campaign.artworkUrl,
    fundedAt: campaign.fundedAt?.toISOString() ?? null,

    escrowCampaignId: campaign.escrowCampaignId,
    escrowAddress: campaign.escrowAddress,
    fundingTxHash: campaign.escrowCampaignId ? campaign.fundingReference : null,

    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

export async function listCampaigns(
  context: BrandContext,
): Promise<CampaignListResponse> {
  const prisma = getPrismaClient();
  const campaigns = await prisma.campaign.findMany({
    where: { organizationId: context.organizationId },
    orderBy: { updatedAt: "desc" },
  });

  return {
    organization: {
      id: context.organizationId,
      name: context.organizationName,
    },
    campaigns: campaigns.map(toCampaignDto),
  };
}

export async function createCampaign(
  context: BrandContext,
  input: CampaignCreateInput,
): Promise<CampaignDto> {
  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.create({
    data: {
      organizationId: context.organizationId,
      createdById: context.userId,
      name: input.name,
      briefText: input.briefText,
      currency: input.currency,
      placementCount: input.placementCount ?? null,
      budgetLimitMinor: input.budgetLimit ?? null,
      destinationUrl: input.destinationUrl ?? null,
      deadline: input.deadline ?? null,
      countryCode: input.countryCode ?? null,
      countryName: input.countryName ?? null,
      city: input.city ?? null,
      ...(input.wizardStep ? { wizardStep: input.wizardStep } : {}),
      areaLabel: buildAreaLabel({
        city: input.city ?? null,
        countryName: input.countryName ?? null,
        radiusMeters: null,
      }),
      status: CampaignStatus.DRAFT,
    },
  });

  return toCampaignDto(campaign);
}

export async function getCampaign(
  context: BrandContext,
  campaignId: string,
): Promise<CampaignDto> {
  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      organizationId: context.organizationId,
    },
  });

  if (!campaign) {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
  }

  return toCampaignDto(campaign);
}

export async function updateCampaign(
  context: BrandContext,
  campaignId: string,
  input: CampaignUpdateInput,
): Promise<CampaignDto> {
  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      organizationId: context.organizationId,
    },
  });

  if (!campaign) {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
  }

  if (campaign.status !== CampaignStatus.DRAFT) {
    throw new ApiError(
      409,
      "CAMPAIGN_NOT_EDITABLE",
      "Only draft campaigns can be edited.",
    );
  }

  const data: Prisma.CampaignUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.briefText !== undefined) data.briefText = input.briefText;
  if (input.placementCount !== undefined)
    data.placementCount = input.placementCount;
  if (input.budgetLimit !== undefined) data.budgetLimitMinor = input.budgetLimit;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.destinationUrl !== undefined)
    data.destinationUrl = input.destinationUrl;
  if (input.deadline !== undefined) data.deadline = input.deadline;
  if (input.countryCode !== undefined) data.countryCode = input.countryCode;
  if (input.countryName !== undefined) data.countryName = input.countryName;
  if (input.city !== undefined) data.city = input.city;
  if (input.centerLatitude !== undefined)
    data.centerLatitude = input.centerLatitude;
  if (input.centerLongitude !== undefined)
    data.centerLongitude = input.centerLongitude;
  if (input.radiusMeters !== undefined) data.radiusMeters = input.radiusMeters;
  if (input.locationStrategy !== undefined)
    data.locationStrategy = input.locationStrategy;
  if (input.wizardStep !== undefined) data.wizardStep = input.wizardStep;

  // The label always follows the structured geography it describes.
  data.areaLabel = buildAreaLabel({
    city: input.city ?? campaign.city,
    countryName: input.countryName ?? campaign.countryName,
    radiusMeters: input.radiusMeters ?? campaign.radiusMeters,
  });

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data,
  });

  return toCampaignDto(updated);
}
