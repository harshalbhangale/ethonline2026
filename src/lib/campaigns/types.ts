import type { PosterDesign } from "@/lib/assets/design";
export const campaignStatuses = [
  "DRAFT",
  "QUOTED",
  "FUNDED",
  "ASSETS_READY",
  "DEPLOYING",
  "VERIFYING",
  "LIVE",
  "EXPIRED",
  "REMOVING",
  "COMPLETE",
  "CANCELLED",
  "DISPUTED",
] as const;

export type CampaignStatusValue = (typeof campaignStatuses)[number];

export const campaignWizardSteps = [
  "BRIEF",
  "LOCATION",
  "PLACEMENTS",
  "CREATIVE",
  "REVIEW",
] as const;

export type CampaignWizardStepValue = (typeof campaignWizardSteps)[number];

export const locationStrategies = [
  "AUTO_APPROVED",
  "MANUAL_SELECTION",
] as const;

export type LocationStrategyValue = (typeof locationStrategies)[number];

export const assetTypes = [
  "QR_NORMAL",
  "QR_MAGIC",
  "QR_VERY_MAGIC",
  "NFC",
] as const;

export type AssetTypeValue = (typeof assetTypes)[number];

/** Presentation for each asset tier in the wizard. `priceLabel` is derived from
 * the multiplier in `pricing.ts`; keep the two in sync. */
export const assetTypeOptions: {
  value: AssetTypeValue;
  emoji: string;
  label: string;
  description: string;
  priceLabel: string;
}[] = [
  {
    value: "QR_NORMAL",
    emoji: "💣",
    label: "Normal QR",
    description: "A plain printed QR code. Boring, but it works.",
    priceLabel: "1×",
  },
  {
    value: "QR_MAGIC",
    emoji: "💣",
    label: "Magic QR",
    description: "A branded QR that blends into your artwork.",
    priceLabel: "1×",
  },
  {
    value: "QR_VERY_MAGIC",
    emoji: "💣",
    label: "Very Magic QR",
    description: "A premium, high-craft coded asset.",
    priceLabel: "2×",
  },
  {
    value: "NFC",
    emoji: "💣",
    label: "NFC",
    description: "A tap-to-open NFC tag alongside the code.",
    priceLabel: "4×",
  },
];

/**
 * A campaign as seen by the browser.
 *
 * Draft-completable fields are nullable because the wizard saves after every
 * step. Completeness is enforced when a campaign leaves DRAFT, not here.
 */
export type CampaignDto = {
  id: string;
  organizationId: string;
  name: string;
  briefText: string;
  status: CampaignStatusValue;
  wizardStep: CampaignWizardStepValue;
  currency: string;

  placementCount: number | null;
  budgetLimitMinor: string | null;
  budgetLimit: string | null;
  destinationUrl: string | null;
  deadline: string | null;
  assetType: AssetTypeValue;

  areaLabel: string | null;
  countryCode: string | null;
  countryName: string | null;
  city: string | null;
  centerLatitude: number | null;
  centerLongitude: number | null;
  radiusMeters: number | null;
  locationStrategy: LocationStrategyValue | null;

  artworkUrl: string | null;
  /** Resolved against the tier and artwork, so always renderable as-is. */
  posterDesign: PosterDesign;
  fundedAt: string | null;

  /** Set when the campaign is funded through CampaignEscrow. */
  escrowCampaignId: string | null;
  escrowAddress: string | null;
  fundingTxHash: string | null;

  createdAt: string;
  updatedAt: string;
};

export type OrganizationDto = {
  id: string;
  name: string;
};

export type CampaignListResponse = {
  organization: OrganizationDto;
  campaigns: CampaignDto[];
};

export type CampaignResponse = {
  campaign: CampaignDto;
};

export type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string[] | undefined>;
    /** Structured context, such as which fields a campaign is still missing. */
    details?: unknown;
  };
};
