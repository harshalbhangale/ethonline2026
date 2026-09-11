import { describe, expect, test } from "bun:test";
import {
  evaluatePlacement,
  isSpotCheckSelected,
  type EvidenceBundle,
  type EvidenceSubmission,
  type LocationPing,
} from "./checks";

const now = Date.parse("2026-09-11T10:00:00Z");
const site = { latitude: 12.9116, longitude: 77.6446 };

function submission(overrides: Partial<EvidenceSubmission> = {}): EvidenceSubmission {
  return {
    role: "INSTALLER",
    workerRef: "worker-a",
    scannedShortCode: "AB12CD",
    latitude: site.latitude,
    longitude: site.longitude,
    accuracyMeters: 8,
    capturedAt: new Date(now).toISOString(),
    challengeSymbol: "PHOTO",
    challengeResponse: "PHOTO",
    challengeIssuedAt: new Date(now - 10 * 60_000).toISOString(),
    challengeExpiresAt: new Date(now + 60_000).toISOString(),
    mediaHash: "0x" + "a".repeat(64),
    ...overrides,
  };
}

/** Walking in from ~600 m away and waiting two minutes on site. */
function arrivingTrail(): LocationPing[] {
  return [
    { latitude: site.latitude + 0.0055, longitude: site.longitude, accuracyMeters: 10, recordedAt: new Date(now - 8 * 60_000).toISOString() },
    { latitude: site.latitude + 0.0025, longitude: site.longitude, accuracyMeters: 10, recordedAt: new Date(now - 5 * 60_000).toISOString() },
    { latitude: site.latitude + 0.0001, longitude: site.longitude, accuracyMeters: 8, recordedAt: new Date(now - 2 * 60_000).toISOString() },
    { latitude: site.latitude, longitude: site.longitude, accuracyMeters: 6, recordedAt: new Date(now - 30_000).toISOString() },
  ];
}

function bundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    placementId: "placement1234",
    onchainPlacementId: "0x" + "1".repeat(64),
    expectedShortCode: "AB12CD",
    mode: "SELF",
    geofence: { ...site, radiusMeters: 75 },
    installation: submission(),
    verification: null,
    trail: arrivingTrail(),
    priorMediaHashes: [],
    ...overrides,
  };
}

describe("self-verified placements", () => {
  test("approve a worker who arrived, waited and photographed on site", () => {
    expect(evaluatePlacement(bundle())).toEqual({ approved: true, reasons: [] });
  });

  test("reject a photo with no location trail", () => {
    expect(evaluatePlacement(bundle({ trail: [] })).reasons).toContain("INSTALLER:NO_LOCATION_TRAIL");
  });

  test("reject a worker never seen inside the fence", () => {
    const far = arrivingTrail().map((ping) => ({ ...ping, latitude: site.latitude + 0.02 }));
    expect(evaluatePlacement(bundle({ trail: far })).reasons).toContain("INSTALLER:NEVER_ARRIVED");
  });

  test("reject a photo taken seconds after arriving", () => {
    const rushed = [
      { ...arrivingTrail()[0] },
      { latitude: site.latitude, longitude: site.longitude, accuracyMeters: 6, recordedAt: new Date(now - 5_000).toISOString() },
    ];
    expect(evaluatePlacement(bundle({ trail: rushed })).reasons).toContain("INSTALLER:TOO_SHORT_ON_SITE");
  });

  test("reject a spoofed jump across the city", () => {
    const teleport = [
      { latitude: 13.0, longitude: 77.5, accuracyMeters: 10, recordedAt: new Date(now - 3 * 60_000).toISOString() },
      ...arrivingTrail().slice(2),
    ];
    expect(evaluatePlacement(bundle({ trail: teleport })).reasons).toContain("INSTALLER:IMPOSSIBLE_TRAVEL");
  });

  test("reject the wrong poster code", () => {
    const verdict = evaluatePlacement(bundle({ installation: submission({ scannedShortCode: "ZZ99" }) }));
    expect(verdict.reasons).toContain("INSTALLER:WRONG_QR");
  });

  test("reject a reused photo", () => {
    const verdict = evaluatePlacement(bundle({ priorMediaHashes: ["0x" + "a".repeat(64)] }));
    expect(verdict.reasons).toContain("INSTALLER:DUPLICATE_MEDIA");
  });
});

describe("independent spot checks", () => {
  const verifier = submission({ role: "VERIFIER", workerRef: "worker-b", mediaHash: "0x" + "b".repeat(64) });

  test("approve two independent proofs", () => {
    expect(evaluatePlacement(bundle({ mode: "INDEPENDENT", verification: verifier }))).toEqual({
      approved: true,
      reasons: [],
    });
  });

  test("reject the installer checking themselves", () => {
    const self = submission({ role: "VERIFIER", mediaHash: "0x" + "c".repeat(64) });
    expect(evaluatePlacement(bundle({ mode: "INDEPENDENT", verification: self })).reasons).toContain("SELF_VERIFICATION");
  });

  test("reject a spot check without the checker's proof", () => {
    expect(evaluatePlacement(bundle({ mode: "INDEPENDENT" })).reasons).toContain("MISSING_VERIFICATION");
  });
});

describe("spot check sampling", () => {
  test("never selects at 0% and always at 100%", () => {
    expect(isSpotCheckSelected("0x" + "f".repeat(64), 0)).toBe(false);
    expect(isSpotCheckSelected("0x" + "0".repeat(64), 100)).toBe(true);
  });

  test("selects roughly the requested share", () => {
    let selected = 0;
    for (let index = 0; index < 1000; index++) {
      const seed = (index * 2654435761 % 4294967296).toString(16).padStart(8, "0");
      if (isSpotCheckSelected(seed, 20)) selected++;
    }
    expect(selected).toBeGreaterThan(150);
    expect(selected).toBeLessThan(250);
  });
});
