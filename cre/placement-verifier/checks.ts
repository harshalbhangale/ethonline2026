/**
 * Deterministic placement checks, run inside the TEE.
 *
 * Inputs here are the sensitive part of StickerBomb: exact GPS fixes of both
 * workers, the approved surface's exact position and geofence, worker
 * identities and media fingerprints. Only the boolean verdict, the reason codes
 * and a salted commitment ever leave the enclave.
 */

export type EvidenceSubmission = {
  role: "INSTALLER" | "VERIFIER";
  workerRef: string;
  scannedShortCode: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: string;
  challengeSymbol: string;
  challengeResponse: string;
  challengeIssuedAt: string;
  challengeExpiresAt: string;
  mediaHash: string;
};

export type EvidenceBundle = {
  placementId: string;
  onchainPlacementId: string;
  expectedShortCode: string;
  geofence: { latitude: number; longitude: number; radiusMeters: number };
  installation: EvidenceSubmission | null;
  verification: EvidenceSubmission | null;
  /** Media fingerprints already used by other placements. */
  priorMediaHashes: string[];
};

export type ReasonCode =
  | "MISSING_INSTALLATION"
  | "MISSING_VERIFICATION"
  | "WRONG_QR"
  | "OUTSIDE_GEOFENCE"
  | "CHALLENGE_EXPIRED"
  | "CHALLENGE_MISMATCH"
  | "DUPLICATE_MEDIA"
  | "SELF_VERIFICATION";

export type Verdict = {
  approved: boolean;
  reasons: string[];
};

const EARTH_RADIUS_METRES = 6_371_000;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export function distanceInMetres(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLng / 2) ** 2;
  return EARTH_RADIUS_METRES * 2 * Math.asin(Math.sqrt(a));
}

function checkSubmission(
  bundle: EvidenceBundle,
  submission: EvidenceSubmission,
  graceSeconds: number,
): ReasonCode[] {
  const reasons: ReasonCode[] = [];

  if (submission.scannedShortCode !== bundle.expectedShortCode) {
    reasons.push("WRONG_QR");
  }

  // GPS accuracy widens the fence, but never beyond 2x the approved radius.
  const allowance = Math.min(
    bundle.geofence.radiusMeters * 2,
    bundle.geofence.radiusMeters + (submission.accuracyMeters ?? 0),
  );
  if (distanceInMetres(bundle.geofence, submission) > allowance) {
    reasons.push("OUTSIDE_GEOFENCE");
  }

  const captured = Date.parse(submission.capturedAt);
  const issued = Date.parse(submission.challengeIssuedAt);
  const expires = Date.parse(submission.challengeExpiresAt) + graceSeconds * 1000;
  if (!(captured >= issued && captured <= expires)) {
    reasons.push("CHALLENGE_EXPIRED");
  }

  if (
    submission.challengeResponse.trim().toUpperCase() !==
    submission.challengeSymbol.trim().toUpperCase()
  ) {
    reasons.push("CHALLENGE_MISMATCH");
  }

  if (bundle.priorMediaHashes.includes(submission.mediaHash.toLowerCase())) {
    reasons.push("DUPLICATE_MEDIA");
  }

  return reasons;
}

export function evaluatePlacement(bundle: EvidenceBundle, graceSeconds = 30): Verdict {
  const reasons: string[] = [];

  if (!bundle.installation) reasons.push("MISSING_INSTALLATION");
  if (!bundle.verification) reasons.push("MISSING_VERIFICATION");

  if (bundle.installation) {
    for (const code of checkSubmission(bundle, bundle.installation, graceSeconds)) {
      reasons.push(`INSTALLER:${code}`);
    }
  }

  if (bundle.verification) {
    for (const code of checkSubmission(bundle, bundle.verification, graceSeconds)) {
      reasons.push(`VERIFIER:${code}`);
    }
  }

  if (bundle.installation && bundle.verification) {
    if (bundle.installation.workerRef === bundle.verification.workerRef) {
      reasons.push("SELF_VERIFICATION");
    }
    if (
      bundle.installation.mediaHash.toLowerCase() ===
      bundle.verification.mediaHash.toLowerCase()
    ) {
      reasons.push("DUPLICATE_MEDIA");
    }
  }

  return { approved: reasons.length === 0, reasons };
}
