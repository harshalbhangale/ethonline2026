export type PlacementJobStatusValue =
  | "OPEN"
  | "ACCEPTED"
  | "AWAITING_CHECK"
  | "CHECK_ACCEPTED"
  | "VERIFIED"
  | "REJECTED"
  | "EXPIRED";

export type WorkerJobDto = {
  id: string;
  status: PlacementJobStatusValue;
  campaignName: string;
  venueName: string;
  city: string;
  latitude: number;
  longitude: number;
  /** Withheld until the worker has accepted a role on this job. */
  placementInstructions: string | null;
  shortCode: string;
  installerFeeMinor: string;
  verifierFeeMinor: string;
  currency: string;
  deadline: string | null;
  proofAt: string | null;
  checkedAt: string | null;
  isInstaller: boolean;
  isVerifier: boolean;
  /** Signed, short-lived. Only set on the single-job endpoint. */
  proofPhotoUrl?: string | null;
};

export type WorkerWalletDto = {
  earnedMinor: string;
  pendingMinor: string;
  currency: string;
  history: {
    id: string;
    kind: string;
    amountMinor: string;
    venueName: string | null;
    createdAt: string;
  }[];
};
