import type {
  JobRoleValue,
  JobStatusValue,
  PlacementStatusValue,
} from "@/lib/placements/types";

export const placementStatusLabels: Record<PlacementStatusValue, string> = {
  AWAITING_INSTALL: "Awaiting installer",
  INSTALLING: "Installing",
  INSTALL_SUBMITTED: "Proof in review",
  AWAITING_VERIFIER: "Awaiting verifier",
  VERIFYING: "Being verified",
  READY_FOR_FINAL_VERIFICATION: "Final check",
  VERIFIED: "Verified",
  NEEDS_RECAPTURE: "Needs recapture",
  REMOVING: "Removing",
  REMOVED: "Removed",
  CANCELLED: "Cancelled",
};

export const jobRoleLabels: Record<JobRoleValue, string> = {
  INSTALLER: "Installer",
  VERIFIER: "Verifier",
  CLEANUP: "Cleanup",
};

export const jobStatusLabels: Record<JobStatusValue, string> = {
  OPEN: "Open",
  RESERVED: "Reserved",
  ACCEPTED: "Accepted",
  IN_PROGRESS: "In progress",
  PROOF_SUBMITTED: "Proof submitted",
  ACCEPTED_PROOF: "Proof accepted",
  REJECTED_PROOF: "Recapture requested",
  PAID: "Paid",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

export const placementSteps = [
  "Installed",
  "Independent check",
  "Verified",
  "Removed",
] as const;

/** How many of `placementSteps` a placement has completed. */
export const placementStepsDone: Record<PlacementStatusValue, number> = {
  AWAITING_INSTALL: 0,
  INSTALLING: 0,
  INSTALL_SUBMITTED: 0,
  NEEDS_RECAPTURE: 0,
  AWAITING_VERIFIER: 1,
  VERIFYING: 1,
  READY_FOR_FINAL_VERIFICATION: 2,
  VERIFIED: 3,
  REMOVING: 3,
  REMOVED: 4,
  CANCELLED: 0,
};
