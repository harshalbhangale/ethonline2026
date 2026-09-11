import type { BrandContext } from "@/lib/auth/require-brand";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import {
  artworkObjectExists,
  createArtworkUploadUrl,
  createArtworkViewUrl,
  hashArtwork,
  isAllowedArtworkType,
} from "@/lib/storage/artwork";

/**
 * Artwork is locked once the campaign is funded, because that is when posters
 * are generated and sent to print. Changing the image after that would leave
 * the printed sheets and the recorded artwork hash disagreeing.
 */
async function loadEditableCampaign(
  context: BrandContext,
  campaignId: string,
) {
  const campaign = await getPrismaClient().campaign.findFirst({
    where: { id: campaignId, organizationId: context.organizationId },
    select: { id: true, fundedAt: true },
  });

  if (!campaign) {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
  }

  if (campaign.fundedAt !== null) {
    throw new ApiError(
      409,
      "ARTWORK_LOCKED",
      "Artwork cannot change after the campaign is funded and posters are generated.",
    );
  }

  return campaign;
}

export async function startArtworkUpload(
  context: BrandContext,
  campaignId: string,
  contentType: string,
) {
  if (!isAllowedArtworkType(contentType)) {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Upload a JPEG, PNG or WebP image.",
    );
  }

  await loadEditableCampaign(context, campaignId);
  return createArtworkUploadUrl(campaignId, contentType);
}

/**
 * Records the uploaded artwork against the campaign.
 *
 * The path is confirmed to exist first: a browser that failed midway through
 * its upload must not leave the campaign pointing at a missing object.
 */
export async function saveCampaignArtwork(
  context: BrandContext,
  campaignId: string,
  path: string,
) {
  await loadEditableCampaign(context, campaignId);

  // Scope the path to this campaign so one brand cannot claim another's upload.
  if (!path.startsWith(`${campaignId}/`)) {
    throw new ApiError(400, "ARTWORK_PATH_INVALID", "That artwork does not belong to this campaign.");
  }

  if (!(await artworkObjectExists(path))) {
    throw new ApiError(
      409,
      "ARTWORK_NOT_UPLOADED",
      "The artwork upload did not finish. Please try again.",
    );
  }

  const artworkHash = await hashArtwork(path);

  await getPrismaClient().campaign.update({
    where: { id: campaignId },
    data: { artworkUrl: path, artworkHash },
  });

  return { path, artworkHash, viewUrl: await createArtworkViewUrl(path) };
}

/** A short-lived preview URL for artwork the brand already uploaded. */
export async function getCampaignArtwork(
  context: BrandContext,
  campaignId: string,
) {
  const campaign = await getPrismaClient().campaign.findFirst({
    where: { id: campaignId, organizationId: context.organizationId },
    select: { artworkUrl: true, artworkHash: true },
  });

  if (!campaign) {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
  }

  if (!campaign.artworkUrl) {
    return { path: null, artworkHash: null, viewUrl: null };
  }

  return {
    path: campaign.artworkUrl,
    artworkHash: campaign.artworkHash,
    viewUrl: await createArtworkViewUrl(campaign.artworkUrl),
  };
}
