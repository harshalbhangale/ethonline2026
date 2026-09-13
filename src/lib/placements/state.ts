import type { JobStatus, PlacementStatus } from "@/generated/prisma/client";
import { ApiError } from "@/lib/http/api-error";

/**
 * Allowed status changes for jobs and placements.
 *
 * Every worker-facing update must pass through these checks, so no client can
 * move work straight to an accepted, verified or paid state.
 */
const jobTransitions: Record<JobStatus, readonly JobStatus[]> = {
  OPEN: ["RESERVED", "ACCEPTED", "CANCELLED", "EXPIRED"],
  RESERVED: ["ACCEPTED", "OPEN", "CANCELLED", "EXPIRED"],
  ACCEPTED: ["IN_PROGRESS", "OPEN", "CANCELLED", "EXPIRED"],
  // OPEN: a verifier who could not find the poster releases the check.
  IN_PROGRESS: ["PROOF_SUBMITTED", "OPEN", "CANCELLED", "EXPIRED"],
  PROOF_SUBMITTED: ["ACCEPTED_PROOF", "REJECTED_PROOF"],
  // A rejected proof is recaptured on the same job.
  REJECTED_PROOF: ["IN_PROGRESS", "CANCELLED"],
  ACCEPTED_PROOF: ["PAID"],
  PAID: [],
  CANCELLED: [],
  EXPIRED: [],
};

const placementTransitions: Record<PlacementStatus, readonly PlacementStatus[]> = {
  AWAITING_INSTALL: ["INSTALLING", "CANCELLED"],
  INSTALLING: ["INSTALL_SUBMITTED", "AWAITING_INSTALL", "CANCELLED"],
  // READY_FOR_FINAL_VERIFICATION: a self-verified proof goes straight to the
  // confidential check.
  INSTALL_SUBMITTED: ["AWAITING_VERIFIER", "READY_FOR_FINAL_VERIFICATION", "NEEDS_RECAPTURE"],
  NEEDS_RECAPTURE: ["INSTALL_SUBMITTED", "READY_FOR_FINAL_VERIFICATION", "CANCELLED"],
  AWAITING_VERIFIER: ["VERIFYING", "CANCELLED"],
  VERIFYING: ["READY_FOR_FINAL_VERIFICATION", "AWAITING_VERIFIER", "NEEDS_RECAPTURE"],
  // AWAITING_VERIFIER: the confidential check drew a random spot check.
  READY_FOR_FINAL_VERIFICATION: ["VERIFIED", "NEEDS_RECAPTURE", "AWAITING_VERIFIER"],
  VERIFIED: ["REMOVING"],
  REMOVING: ["REMOVED"],
  REMOVED: [],
  CANCELLED: [],
};

/**
 * Job states that occupy a worker, enforcing one revealed location at a time.
 * A submitted proof no longer occupies them: the field work is done and they
 * are only waiting on verification.
 */
export const activeJobStatuses: JobStatus[] = [
  "RESERVED",
  "ACCEPTED",
  "IN_PROGRESS",
  "REJECTED_PROOF",
];

export function assertJobTransition(from: JobStatus, to: JobStatus) {
  if (!jobTransitions[from].includes(to)) {
    throw new ApiError(
      409,
      "INVALID_JOB_TRANSITION",
      `A job cannot move from ${from} to ${to}.`,
    );
  }
}

export function assertPlacementTransition(
  from: PlacementStatus,
  to: PlacementStatus,
) {
  if (!placementTransitions[from].includes(to)) {
    throw new ApiError(
      409,
      "INVALID_PLACEMENT_TRANSITION",
      `A placement cannot move from ${from} to ${to}.`,
    );
  }
}

/** Demo escape hatch: lets one person walk both halves of the flow. */
function allowSelfVerification() {
  return process.env.ALLOW_SELF_VERIFICATION === "true";
}

export function assertIndependentVerifier(
  installerUserId: string | null,
  verifierUserId: string,
) {
  if (allowSelfVerification()) return;

  if (installerUserId === verifierUserId) {
    throw new ApiError(
      403,
      "SELF_VERIFICATION",
      "You cannot verify a placement you installed.",
    );
  }
}
