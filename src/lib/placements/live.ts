import { JobRole, JobStatus, Prisma } from "@/generated/prisma/client";
import { LANDING_EVENT } from "@/lib/assets/conversions";
import type { BrandContext } from "@/lib/auth/require-brand";
import { distanceInMetres } from "@/lib/campaigns/geo";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import type { PlacementStatusValue } from "@/lib/placements/types";
import { GEOFENCE_RADIUS_METERS } from "@/lib/verification/evidence-api";

/** A worker's position is shown to the brand only while this fresh. */
const LIVE_WINDOW_MS = 10 * 60_000;

const activeJobStatuses: JobStatus[] = [JobStatus.ACCEPTED, JobStatus.IN_PROGRESS, JobStatus.REJECTED_PROOF];

/**
 * The funnel for one poster. Scans and landings differ on purpose: a scan is
 * the phone hitting the short link, a landing is the brand's page actually
 * loading, so the gap between them is people who gave up on the way.
 *
 * Suspected bots are excluded from scans, so these numbers are lower and more
 * honest than raw traffic.
 */
export type PlacementStats = {
  scans: number;
  uniqueScanners: number;
  landings: number;
  conversions: number;
};

export type LivePlacementDto = {
  id: string;
  status: PlacementStatusValue;
  venueName: string;
  shortCode: string;
  venue: { latitude: number; longitude: number };
  stats: PlacementStats;
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

type LatestPing = {
  jobId: string;
  latitude: number;
  longitude: number;
  recordedAt: Date;
};

/**
 * The most recent position for each of the given jobs, in one round trip.
 *
 * DISTINCT ON is the cheap way to say "latest row per job" in Postgres; the
 * alternative is a query per placement, which this endpoint cannot afford
 * because the brand's map polls it continuously.
 */
async function loadLatestPings(jobIds: string[], since: Date) {
  const byJob = new Map<string, LatestPing>();
  if (jobIds.length === 0) return byJob;

  const rows = await getPrismaClient().$queryRaw<LatestPing[]>`
    SELECT DISTINCT ON (job_id)
      job_id AS "jobId", latitude, longitude, recorded_at AS "recordedAt"
    FROM location_pings
    WHERE job_id IN (${Prisma.join(jobIds)})
      AND recorded_at >= ${since}
    ORDER BY job_id, recorded_at DESC
  `;

  for (const row of rows) byJob.set(row.jobId, row);
  return byJob;
}

const emptyStats: PlacementStats = {
  scans: 0,
  uniqueScanners: 0,
  landings: 0,
  conversions: 0,
};

/**
 * Every poster's funnel in three grouped queries, so the cost does not grow
 * with the number of placements.
 */
async function loadPlacementStats(campaignId: string) {
  const prisma = getPrismaClient();
  const realTraffic = { campaignId, isSuspectedBot: false };

  const [scans, sessions, conversions] = await Promise.all([
    prisma.scanEvent.groupBy({
      by: ["assetId"],
      where: realTraffic,
      _count: { _all: true },
    }),
    // One row per distinct session, so the row count is the visitor count.
    prisma.scanEvent.groupBy({
      by: ["assetId", "sessionHash"],
      where: { ...realTraffic, sessionHash: { not: null } },
    }),
    prisma.conversionEvent.groupBy({
      by: ["assetId", "name"],
      where: { campaignId },
      _count: { _all: true },
    }),
  ]);

  const byAsset = new Map<string, PlacementStats>();
  const forAsset = (assetId: string) => {
    const existing = byAsset.get(assetId);
    if (existing) return existing;

    const created = { ...emptyStats };
    byAsset.set(assetId, created);
    return created;
  };

  for (const row of scans) forAsset(row.assetId).scans = row._count._all;
  for (const row of sessions) forAsset(row.assetId).uniqueScanners += 1;

  for (const row of conversions) {
    const stats = forAsset(row.assetId);
    if (row.name === LANDING_EVENT) stats.landings += row._count._all;
    else stats.conversions += row._count._all;
  }

  return byAsset;
}

/**
 * Delivery-style tracking for the brand: each placement's venue, where its
 * worker is right now while a job is underway, and how the poster is performing
 * once it is up.
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

  const [placements, stats] = await Promise.all([
    prisma.placement.findMany({
      where: { campaignId },
      include: {
        location: { select: { venueName: true, latitude: true, longitude: true } },
        asset: { select: { shortCode: true } },
        jobs: { where: { status: { in: activeJobStatuses } }, select: { id: true, role: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    loadPlacementStats(campaignId),
  ]);

  const since = new Date(Date.now() - LIVE_WINDOW_MS);
  const activeJobIds = placements
    .map((placement) => placement.jobs[0]?.id)
    .filter((id): id is string => Boolean(id));

  // One query for every worker's latest position, rather than one per
  // placement: this is served to a poll that runs every few seconds.
  const latestPings = await loadLatestPings(activeJobIds, since);

  const result = placements.map((placement): LivePlacementDto => {
    const activeJob = placement.jobs[0];
    const ping = activeJob ? latestPings.get(activeJob.id) ?? null : null;

    return {
        id: placement.id,
        status: placement.status,
        venueName: placement.location.venueName,
        shortCode: placement.asset.shortCode,
        venue: { latitude: placement.location.latitude, longitude: placement.location.longitude },
        stats: stats.get(placement.assetId) ?? emptyStats,
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
  });

  return {
    placements: result,
    anyActive: result.some((placement) => placement.worker !== null),
    radiusMeters: GEOFENCE_RADIUS_METERS,
  };
}
