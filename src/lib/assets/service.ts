import {
  CampaignAssetStatus,
  CampaignStatus,
  type CampaignAsset,
  type Location,
} from "@/generated/prisma/client";
import { buildScanUrl } from "@/lib/assets/app-url";
import { renderPosterPng, verifyQrPayload } from "@/lib/assets/qr";
import { generateShortCode } from "@/lib/assets/short-code";
import type { CampaignAssetDto } from "@/lib/assets/types";
import type { BrandContext } from "@/lib/auth/require-brand";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";

type AssetWithLocation = CampaignAsset & { location: Location | null };

function toAssetDto(asset: AssetWithLocation): CampaignAssetDto {
  return {
    id: asset.id,
    campaignId: asset.campaignId,
    sequence: asset.sequence,
    shortCode: asset.shortCode,
    qrPayload: asset.qrPayload,
    destinationUrl: asset.destinationUrl,
    status: asset.status,
    version: asset.version,
    imageUrl: `/api/campaigns/${asset.campaignId}/assets/${asset.shortCode}/image`,
    location: asset.location
      ? {
          id: asset.location.id,
          venueName: asset.location.venueName,
          city: asset.location.city,
        }
      : null,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export async function listCampaignAssets(
  context: BrandContext,
  campaignId: string,
): Promise<CampaignAssetDto[]> {
  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organizationId },
    select: { id: true },
  });

  if (!campaign) {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
  }

  const assets = await prisma.campaignAsset.findMany({
    where: { campaignId },
    include: { location: true },
    orderBy: { sequence: "asc" },
  });

  return assets.map(toAssetDto);
}

/**
 * Creates one uniquely coded asset per assigned approved location.
 *
 * Every asset gets its own short code so each physical poster reports
 * separately. Generation is idempotent: calling it again returns the existing
 * assets rather than issuing new codes, because a reissued code would orphan
 * anything already printed.
 */
export async function generateCampaignAssets(
  context: BrandContext,
  campaignId: string,
  appUrl: string,
): Promise<CampaignAssetDto[]> {
  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organizationId },
    include: { locations: { include: { location: true } } },
  });

  if (!campaign) {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
  }

  if (!campaign.destinationUrl) {
    throw new ApiError(
      409,
      "DESTINATION_REQUIRED",
      "Set the scan destination before generating assets.",
    );
  }

  if (campaign.locations.length === 0) {
    throw new ApiError(
      409,
      "NO_ASSIGNED_LOCATIONS",
      "Assign approved locations before generating assets.",
    );
  }

  const existing = await prisma.campaignAsset.findMany({
    where: { campaignId },
    include: { location: true },
    orderBy: { sequence: "asc" },
  });

  if (existing.length > 0) {
    return existing.map(toAssetDto);
  }

  const ordered = [...campaign.locations].sort((a, b) =>
    a.location.venueName.localeCompare(b.location.venueName),
  );

  const created: AssetWithLocation[] = [];

  for (const [index, assignment] of ordered.entries()) {
    const shortCode = generateShortCode();
    const qrPayload = buildScanUrl(appUrl, shortCode);

    // Prove the asset is scannable before it is recorded as ready. A poster
    // that cannot be decoded must never reach a printer.
    const poster = await renderPosterPng({
      payload: qrPayload,
      headline: campaign.name,
      venueName: assignment.location.venueName,
      shortCode,
    });
    const verification = await verifyQrPayload(poster, qrPayload);

    if (!verification.matches) {
      throw new ApiError(
        500,
        "ASSET_VERIFICATION_FAILED",
        "A generated QR code could not be read back. No assets were created.",
        { sequence: index + 1, decoded: verification.decoded },
      );
    }

    created.push(
      await prisma.campaignAsset.create({
        data: {
          campaignId,
          locationId: assignment.locationId,
          shortCode,
          sequence: index + 1,
          qrPayload,
          destinationUrl: campaign.destinationUrl,
          status: CampaignAssetStatus.READY,
        },
        include: { location: true },
      }),
    );
  }

  if (campaign.status === CampaignStatus.FUNDED) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.ASSETS_READY },
    });
  }

  return created.map(toAssetDto);
}

/** Loads an asset for poster rendering, scoped to the owning organization. */
export async function getOwnedAssetByShortCode(
  context: BrandContext,
  campaignId: string,
  shortCode: string,
) {
  const prisma = getPrismaClient();
  const asset = await prisma.campaignAsset.findFirst({
    where: {
      shortCode,
      campaignId,
      campaign: { organizationId: context.organizationId },
    },
    include: { location: true, campaign: { select: { name: true } } },
  });

  if (!asset) {
    throw new ApiError(404, "ASSET_NOT_FOUND", "Asset not found.");
  }

  return asset;
}
