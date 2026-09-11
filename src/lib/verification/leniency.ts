/**
 * Relaxes verification for demonstrations.
 *
 * Deliberately a server-only variable, not a NEXT_PUBLIC one: whether proof is
 * checked properly is not something the browser should be able to read, and
 * tying it to the demo-controls flag would mean that showing the demo buttons
 * silently switched the checks off too.
 *
 * What it relaxes: how long a worker must stand on site, how close they must
 * be, and whether a location trail is required at all. What it never relaxes:
 * scanning the right poster, reusing someone else's photo, and one person
 * playing both installer and checker. A placement submitted from the wrong side
 * of the city still fails, which is what keeps a rejection demonstrable.
 */
export function isLenientVerification() {
  return process.env.STICKERBOMB_LENIENT_VERIFICATION?.trim() === "true";
}

/** Proof counts when captured within this radius of the approved surface. */
export function geofenceRadiusMeters() {
  // Wide enough that testers walking up from a real address don't get
  // rejected on GPS drift alone. Still tighter than the ~2 km the fraud demo
  // offsets by, so that path still fails.
  return isLenientVerification() ? 3_000 : 75;
}

/** Time a self-verifying worker must be seen on site before the photo. */
export function minDwellSeconds() {
  if (isLenientVerification()) return 0;
  return Number(process.env.STICKERBOMB_MIN_DWELL_SECONDS ?? 30);
}

/** Immediate feedback only; the confidential check enforces the real fence. */
export function precheckRadiusMetres() {
  return isLenientVerification() ? 5_000 : 250;
}

/** Share of self-verified placements pulled into a second, human check. */
export function spotCheckPercent() {
  if (isLenientVerification()) return 0;
  return Number(process.env.STICKERBOMB_SPOT_CHECK_PERCENT ?? 10);
}
