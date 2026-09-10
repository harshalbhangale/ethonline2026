export type CampaignAssetStatusValue =
  | "PENDING"
  | "GENERATING"
  | "READY"
  | "DISABLED";

export type CampaignAssetDto = {
  id: string;
  campaignId: string;
  sequence: number;
  shortCode: string;
  qrPayload: string;
  destinationUrl: string;
  status: CampaignAssetStatusValue;
  version: number;
  /** Route that renders the printable poster for this asset. */
  imageUrl: string;
  location: {
    id: string;
    venueName: string;
    city: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type CampaignAssetsResponse = {
  assets: CampaignAssetDto[];
};
