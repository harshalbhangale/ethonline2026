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

/** Label of the next demo-control step for a placement, if any. */
export const demoStepLabels: Partial<Record<PlacementStatusValue, string>> = {
  AWAITING_INSTALL: "Send demo installer",
  INSTALLING: "Submit installer proof",
  AWAITING_VERIFIER: "Send independent verifier",
  VERIFYING: "Submit verifier proof",
  READY_FOR_FINAL_VERIFICATION: "Run confidential verification",
  NEEDS_RECAPTURE: "Recapture proof",
};

const reasonLabels: Record<string, string> = {
  OUTSIDE_GEOFENCE: "captured outside the approved area",
  WRONG_QR: "scanned the wrong QR code",
  CHALLENGE_EXPIRED: "missed the challenge window",
  CHALLENGE_MISMATCH: "did not match the challenge",
  DUPLICATE_MEDIA: "reused media",
  SELF_VERIFICATION: "installer and verifier were the same person",
  MISSING_INSTALLATION: "installer proof missing",
  MISSING_VERIFICATION: "verifier proof missing",
};

/** Turns a CRE reason code such as "INSTALLER:OUTSIDE_GEOFENCE" into words. */
export function describeReason(reason: string) {
  const [role, code] = reason.includes(":") ? reason.split(":") : [null, reason];
  const text = reasonLabels[code] ?? code.toLowerCase().replace(/_/g, " ");
  if (!role) return text.charAt(0).toUpperCase() + text.slice(1);
  return `${role === "INSTALLER" ? "Installer" : "Verifier"} ${text}`;
}

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
