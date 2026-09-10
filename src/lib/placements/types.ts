export type PlacementStatusValue =
  | "AWAITING_INSTALL"
  | "INSTALLING"
  | "INSTALL_SUBMITTED"
  | "AWAITING_VERIFIER"
  | "VERIFYING"
  | "READY_FOR_FINAL_VERIFICATION"
  | "VERIFIED"
  | "NEEDS_RECAPTURE"
  | "REMOVING"
  | "REMOVED"
  | "CANCELLED";

export type JobRoleValue = "INSTALLER" | "VERIFIER" | "CLEANUP";

export type JobStatusValue =
  | "OPEN"
  | "RESERVED"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "PROOF_SUBMITTED"
  | "ACCEPTED_PROOF"
  | "REJECTED_PROOF"
  | "PAID"
  | "CANCELLED"
  | "EXPIRED";

/** A job as the brand sees it. Worker identity is never included. */
export type PlacementJobDto = {
  role: JobRoleValue;
  status: JobStatusValue;
  rewardMinor: string;
  reward: string;
  currency: string;
  acceptedAt: string | null;
  submittedAt: string | null;
  resolvedAt: string | null;
  paidAt: string | null;
};

export type PlacementDto = {
  id: string;
  campaign: { id: string; name: string };
  status: PlacementStatusValue;
  asset: { shortCode: string; sequence: number };
  location: { id: string; venueName: string; city: string };
  jobs: PlacementJobDto[];
  installedAt: string | null;
  verifiedAt: string | null;
  removedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlacementSummaryDto = {
  total: number;
  awaitingInstall: number;
  inProgress: number;
  verified: number;
  removed: number;
};

export type PlacementListResponse = {
  placements: PlacementDto[];
  summary: PlacementSummaryDto;
};
