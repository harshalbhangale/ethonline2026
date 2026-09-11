/**
 * Deterministic placement checks, run inside the TEE.
 *
 * Inputs here are the sensitive part of StickerBomb: the worker's live
 * location trail, exact GPS fixes, the approved surface's exact position and
 * geofence, worker identities and photo fingerprints. Only the boolean
 * verdict, reason codes and a salted commitment ever leave the enclave.
 *
 * Two modes:
 * - SELF: the installer's own proof. With no second person, the location
 *   trail carries the weight: the worker must be seen inside the fence for a
 *   while before the photo, and never move impossibly fast.
 * - INDEPENDENT: a randomly sampled spot check, where a different worker's
 *   proof is compared with the installer's.
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

export type LocationPing = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: string;
};

export type EvidenceBundle = {
  placementId: string;
  onchainPlacementId: string;
  expectedShortCode: string;
  mode: "SELF" | "INDEPENDENT";
  geofence: { latitude: number; longitude: number; radiusMeters: number };
  installation: EvidenceSubmission | null;
  verification: EvidenceSubmission | null;
  /** The installer's live location while holding the job, oldest first. */
  trail: LocationPing[];
  /** Media fingerprints already used by other placements. */
  priorMediaHashes: string[];
};

export type Verdict = {
  approved: boolean;
  reasons: string[];
};

export type CheckOptions = {
  graceSeconds: number;
  /** Time the worker must be seen on site before the photo (SELF mode). */
  minDwellSeconds: number;
  /** Faster than this between two pings is treated as spoofed location. */
  maxSpeedKmh: number;
  /**
   * Relaxed checking for demonstrations.
   *
   * Drops the requirements a live demo cannot reliably satisfy: a continuous
   * location trail, a minimum time on site, and the timed challenge. It never
   * drops the checks that make a placement trustworthy at all, so a poster
   * photographed from the wrong side of the city, a reused photo, or one person
   * playing both roles still fails.
   */
  lenient: boolean;
};

export const defaultCheckOptions: CheckOptions = {
  graceSeconds: 30,
  minDwellSeconds: 30,
  maxSpeedKmh: 150,
  lenient: false,
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

/** GPS accuracy widens the fence, but never beyond 2x the approved radius. */
function insideFence(
  bundle: EvidenceBundle,
  point: { latitude: number; longitude: number; accuracyMeters: number | null },
) {
  const allowance = Math.min(
    bundle.geofence.radiusMeters * 2,
    bundle.geofence.radiusMeters + (point.accuracyMeters ?? 0),
  );
  return distanceInMetres(bundle.geofence, point) <= allowance;
}

function checkSubmission(
  bundle: EvidenceBundle,
  submission: EvidenceSubmission,
  options: CheckOptions,
): string[] {
  const reasons: string[] = [];

  if (submission.scannedShortCode.trim().toUpperCase() !== bundle.expectedShortCode.toUpperCase()) {
    reasons.push("WRONG_QR");
  }

  if (!insideFence(bundle, submission)) {
    reasons.push("OUTSIDE_GEOFENCE");
  }

  // The timed challenge is the part a live demonstration cannot keep up with.
  if (!options.lenient) {
    const captured = Date.parse(submission.capturedAt);
    const issued = Date.parse(submission.challengeIssuedAt);
    const expires = Date.parse(submission.challengeExpiresAt) + options.graceSeconds * 1000;
    if (!(captured >= issued && captured <= expires)) {
      reasons.push("CHALLENGE_EXPIRED");
    }

    if (
      submission.challengeResponse.trim().toUpperCase() !==
      submission.challengeSymbol.trim().toUpperCase()
    ) {
      reasons.push("CHALLENGE_MISMATCH");
    }
  }

  if (bundle.priorMediaHashes.includes(submission.mediaHash.toLowerCase())) {
    reasons.push("DUPLICATE_MEDIA");
  }

  return reasons;
}

/**
 * SELF mode's substitute for a second person: the installer's own trail must
 * show them on site, for long enough, without teleporting.
 */
function checkTrail(
  bundle: EvidenceBundle,
  installation: EvidenceSubmission,
  options: CheckOptions,
): string[] {
  const captured = Date.parse(installation.capturedAt);
  const pings = bundle.trail
    .filter((ping) => Date.parse(ping.recordedAt) <= captured + options.graceSeconds * 1000)
    .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));

  // A demo phone may never have granted location at all, so an absent trail is
  // not treated as evidence of anything. The photo's own fix still has to be
  // inside the fence, which is checked separately.
  if (pings.length < 2) return options.lenient ? [] : ["NO_LOCATION_TRAIL"];

  const reasons: string[] = [];

  for (let index = 1; index < pings.length; index++) {
    const metres = distanceInMetres(pings[index - 1], pings[index]);
    const hours =
      Math.max(1, Date.parse(pings[index].recordedAt) - Date.parse(pings[index - 1].recordedAt)) /
      3_600_000;
    if (metres > 1_000 && metres / 1_000 / hours > options.maxSpeedKmh) {
      reasons.push("IMPOSSIBLE_TRAVEL");
      break;
    }
  }

  // Impossible travel is kept even when lenient: it is the one trail check that
  // catches spoofing rather than merely an imperfect demo.
  if (options.lenient) return reasons;

  const firstInside = pings.find((ping) => insideFence(bundle, ping));
  if (!firstInside) {
    reasons.push("NEVER_ARRIVED");
  } else if (captured - Date.parse(firstInside.recordedAt) < options.minDwellSeconds * 1000) {
    reasons.push("TOO_SHORT_ON_SITE");
  }

  return reasons;
}

export function evaluatePlacement(
  bundle: EvidenceBundle,
  overrides: Partial<CheckOptions> = {},
): Verdict {
  const options = { ...defaultCheckOptions, ...overrides };
  const reasons: string[] = [];

  if (!bundle.installation) {
    return { approved: false, reasons: ["MISSING_INSTALLATION"] };
  }

  for (const code of checkSubmission(bundle, bundle.installation, options)) {
    reasons.push(`INSTALLER:${code}`);
  }

  if (bundle.mode === "SELF") {
    for (const code of checkTrail(bundle, bundle.installation, options)) {
      reasons.push(`INSTALLER:${code}`);
    }
    return { approved: reasons.length === 0, reasons };
  }

  if (!bundle.verification) {
    reasons.push("MISSING_VERIFICATION");
    return { approved: false, reasons };
  }

  for (const code of checkSubmission(bundle, bundle.verification, options)) {
    reasons.push(`VERIFIER:${code}`);
  }
  if (bundle.installation.workerRef === bundle.verification.workerRef) {
    reasons.push("SELF_VERIFICATION");
  }
  if (bundle.installation.mediaHash.toLowerCase() === bundle.verification.mediaHash.toLowerCase()) {
    reasons.push("DUPLICATE_MEDIA");
  }

  return { approved: reasons.length === 0, reasons };
}

/**
 * Whether a self-verified placement is drawn for an independent spot check.
 * Seeded with a secret salt inside the enclave, so workers cannot predict
 * which of their placements will be checked.
 */
export function isSpotCheckSelected(seedHex: string, percent: number) {
  if (percent <= 0) return false;
  // First 8 hex digits of a keccak256 digest are uniformly distributed.
  const bucket = parseInt(seedHex.replace(/^0x/, "").slice(0, 8), 16) % 100;
  return bucket < percent;
}
