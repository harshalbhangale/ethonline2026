import { JobRole, JobStatus } from "@/generated/prisma/client";
import type { BrandContext } from "@/lib/auth/require-brand";
import { distanceInMetres } from "@/lib/campaigns/geo";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import type { PlacementStatusValue } from "@/lib/placements/types";
import { GEOFENCE_RADIUS_METERS } from "@/lib/verification/evidence-api";

/** A worker's position is shown to the brand only while this fresh. */
const LIVE_WINDOW_MS = 10 * 60_000;

const activeJobStatuses: JobStatus[] = [JobStatus.ACCEPTED, JobStatus.IN_PROGRESS, JobStatus.REJECTED_PROOF];

export type LivePlacementDto = {
  id: string;
  status: PlacementStatusValue;
  venueName: string;
  venue: { latitude: number; longitude: number };
  /** Latest position of the worker on an active job; no history, no identity. */
  worker: {
    role: "INSTALLER" | "VERIFIER";
    latitude: number;
    longitude: number;
    distanceMetres: number;
    updatedAt: string;
  } | null;
};

export type LiveCampaignResponse = {
  placements: LivePlacementDto[];
  anyActive: boolean;
  /** The fence drawn around each venue, so the client never hardcodes it. */
  radiusMeters: number;
};

/**
 * Delivery-style tracking for the brand: each placement's venue, and where
 * its worker is right now while a job is underway.
 */
export async function getLiveCampaign(
  context: BrandContext,
  campaignId: string,
): Promise<LiveCampaignResponse> {
  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organizationId },
    select: { id: true },
  });
  if (!campaign) throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");

  const placements = await prisma.placement.findMany({
    where: { campaignId },
    include: {
      location: { select: { venueName: true, latitude: true, longitude: true } },
      jobs: { where: { status: { in: activeJobStatuses } }, select: { id: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const since = new Date(Date.now() - LIVE_WINDOW_MS);
  const result = await Promise.all(
    placements.map(async (placement): Promise<LivePlacementDto> => {
      const activeJob = placement.jobs[0];
      const ping = activeJob
        ? await prisma.locationPing.findFirst({
            where: { jobId: activeJob.id, recordedAt: { gte: since } },
            orderBy: { recordedAt: "desc" },
          })
        : null;

      return {
        id: placement.id,
        status: placement.status,
        venueName: placement.location.venueName,
        venue: { latitude: placement.location.latitude, longitude: placement.location.longitude },
        worker:
          activeJob && ping
            ? {
                role: activeJob.role === JobRole.VERIFIER ? "VERIFIER" : "INSTALLER",
                latitude: ping.latitude,
                longitude: ping.longitude,
                distanceMetres: Math.round(distanceInMetres(ping, placement.location)),
                updatedAt: ping.recordedAt.toISOString(),
              }
            : null,
      };
    }),
  );

  return {
    placements: result,
    anyActive: result.some((placement) => placement.worker !== null),
    radiusMeters: GEOFENCE_RADIUS_METERS,
  };
}
