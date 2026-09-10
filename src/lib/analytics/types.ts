export type AssetScanBreakdown = {
  assetId: string;
  shortCode: string;
  sequence: number;
  venueName: string | null;
  campaignId: string;
  campaignName: string;
  totalScans: number;
  estimatedUniqueScans: number;
  lastScanAt: string | null;
};

export type ScanTrendPoint = {
  date: string;
  totalScans: number;
};

export type AnalyticsSummary = {
  /** Every recorded scan, including repeats. */
  totalScans: number;
  /**
   * Distinct day-scoped session hashes. An estimate, deliberately reported
   * separately from the raw total and never used for payouts.
   */
  estimatedUniqueScans: number;
  suspectedBotScans: number;
  assetCount: number;
  campaignsWithAssets: number;
};

export type AnalyticsResponse = {
  summary: AnalyticsSummary;
  assets: AssetScanBreakdown[];
  trend: ScanTrendPoint[];
  trendDays: number;
};
