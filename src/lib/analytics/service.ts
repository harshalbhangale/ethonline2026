import { Prisma } from "@/generated/prisma/client";
import type {
  AnalyticsResponse,
  AssetScanBreakdown,
  ScanTrendPoint,
} from "@/lib/analytics/types";
import type { BrandContext } from "@/lib/auth/require-brand";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";

const trendDays = 14;

type SummaryRow = {
  total_scans: bigint;
  estimated_unique: bigint;
  suspected_bots: bigint;
  asset_count: bigint;
  campaigns_with_assets: bigint;
};

type BreakdownRow = {
  asset_id: string;
  short_code: string;
  sequence: number;
  venue_name: string | null;
  campaign_id: string;
  campaign_name: string;
  total_scans: bigint;
  estimated_unique: bigint;
  last_scan_at: Date | null;
};

type TrendRow = {
  day: Date;
  total_scans: bigint;
};

/**
 * Scan analytics for a brand organization, optionally narrowed to one campaign.
 *
 * Totals and unique estimates are kept apart on purpose: a raw scan count is
 * engagement, not proof that anything was installed, and it must never drive a
 * worker payout.
 */
export async function getScanAnalytics(
  context: BrandContext,
  campaignId?: string,
): Promise<AnalyticsResponse> {
  const prisma = getPrismaClient();

  if (campaignId) {
    const owned = await prisma.campaign.findFirst({
      where: { id: campaignId, organizationId: context.organizationId },
      select: { id: true },
    });

    if (!owned) {
      throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
    }
  }

  const scopeFilter = campaignId
    ? Prisma.sql`AND c.id = ${campaignId}`
    : Prisma.empty;

  const [summaryRows, breakdownRows, trendRows] = await Promise.all([
    prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
      SELECT
        COUNT(se.id) AS total_scans,
        COUNT(DISTINCT se.session_hash) AS estimated_unique,
        COUNT(se.id) FILTER (WHERE se.is_suspected_bot) AS suspected_bots,
        COUNT(DISTINCT a.id) AS asset_count,
        COUNT(DISTINCT c.id) AS campaigns_with_assets
      FROM campaigns c
      JOIN campaign_assets a ON a.campaign_id = c.id
      LEFT JOIN scan_events se ON se.asset_id = a.id
      WHERE c.organization_id = ${context.organizationId}
      ${scopeFilter}
    `),
    prisma.$queryRaw<BreakdownRow[]>(Prisma.sql`
      SELECT
        a.id AS asset_id,
        a.short_code,
        a.sequence,
        l.venue_name,
        c.id AS campaign_id,
        c.name AS campaign_name,
        COUNT(se.id) AS total_scans,
        COUNT(DISTINCT se.session_hash) AS estimated_unique,
        MAX(se.created_at) AS last_scan_at
      FROM campaigns c
      JOIN campaign_assets a ON a.campaign_id = c.id
      LEFT JOIN locations l ON l.id = a.location_id
      LEFT JOIN scan_events se ON se.asset_id = a.id
      WHERE c.organization_id = ${context.organizationId}
      ${scopeFilter}
      GROUP BY a.id, a.short_code, a.sequence, l.venue_name, c.id, c.name
      ORDER BY COUNT(se.id) DESC, a.sequence ASC
    `),
    prisma.$queryRaw<TrendRow[]>(Prisma.sql`
      SELECT
        date_trunc('day', se.created_at) AS day,
        COUNT(se.id) AS total_scans
      FROM scan_events se
      JOIN campaigns c ON c.id = se.campaign_id
      WHERE c.organization_id = ${context.organizationId}
        AND se.created_at >= NOW() - (${trendDays} || ' days')::interval
      ${scopeFilter}
      GROUP BY 1
      ORDER BY 1 ASC
    `),
  ]);

  const summary = summaryRows[0];
  const assets: AssetScanBreakdown[] = breakdownRows.map((row) => ({
    assetId: row.asset_id,
    shortCode: row.short_code,
    sequence: row.sequence,
    venueName: row.venue_name,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    totalScans: Number(row.total_scans),
    estimatedUniqueScans: Number(row.estimated_unique),
    lastScanAt: row.last_scan_at?.toISOString() ?? null,
  }));

  // Fill gaps so a sparse series does not imply missing data.
  const counts = new Map(
    trendRows.map((row) => [
      row.day.toISOString().slice(0, 10),
      Number(row.total_scans),
    ]),
  );
  const trend: ScanTrendPoint[] = [];

  for (let offset = trendDays - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    trend.push({ date: key, totalScans: counts.get(key) ?? 0 });
  }

  return {
    summary: {
      totalScans: Number(summary?.total_scans ?? 0),
      estimatedUniqueScans: Number(summary?.estimated_unique ?? 0),
      suspectedBotScans: Number(summary?.suspected_bots ?? 0),
      assetCount: Number(summary?.asset_count ?? 0),
      campaignsWithAssets: Number(summary?.campaigns_with_assets ?? 0),
    },
    assets,
    trend,
    trendDays,
  };
}
