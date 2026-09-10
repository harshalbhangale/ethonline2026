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

export type EvidenceStatusValue = "SUBMITTED" | "ACCEPTED" | "REJECTED";

/** Latest run of the confidential CRE verifier for a placement. */
export type VerificationRunDto = {
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  mode: string;
  approved: boolean | null;
  reasons: string[];
  txHash: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type PlacementTransactionDto = {
  kind: string;
  txHash: string;
  status: string;
  createdAt: string;
};

export type PlacementDto = {
  id: string;
  campaign: { id: string; name: string };
  status: PlacementStatusValue;
  asset: { shortCode: string; sequence: number };
  location: { id: string; venueName: string; city: string };
  jobs: PlacementJobDto[];
  /** Escrow key, set once the placement's rewards are reserved onchain. */
  onchain: { placementKey: string | null };
  /** Whether proof exists, never its contents: coordinates stay confidential. */
  proofs: {
    installer: EvidenceStatusValue | null;
    verifier: EvidenceStatusValue | null;
  };
  verification: VerificationRunDto | null;
  transactions: PlacementTransactionDto[];
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
  /** True when this server can run the Chainlink CRE verifier. */
  verificationAvailable: boolean;
};
