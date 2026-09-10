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

  areaLabel: string | null;
  countryCode: string | null;
  countryName: string | null;
  city: string | null;
  centerLatitude: number | null;
  centerLongitude: number | null;
  radiusMeters: number | null;
  locationStrategy: LocationStrategyValue | null;

  artworkUrl: string | null;
  fundedAt: string | null;

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
