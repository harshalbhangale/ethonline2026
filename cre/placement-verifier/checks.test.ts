import { describe, expect, test } from "bun:test";
import { evaluatePlacement, type EvidenceBundle, type EvidenceSubmission } from "./checks";

const now = Date.parse("2026-09-11T10:00:00Z");

function submission(overrides: Partial<EvidenceSubmission> = {}): EvidenceSubmission {
  return {
    role: "INSTALLER",
    workerRef: "worker-a",
    scannedShortCode: "AB12CD",
    latitude: 40.71234,
    longitude: -74.00567,
    accuracyMeters: 8,
    capturedAt: new Date(now).toISOString(),
    challengeSymbol: "K7QX",
    challengeResponse: "K7QX",
    challengeIssuedAt: new Date(now - 60_000).toISOString(),
    challengeExpiresAt: new Date(now + 60_000).toISOString(),
    mediaHash: "0x" + "a".repeat(64),
    ...overrides,
  };
}

function bundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    placementId: "placement1234",
    onchainPlacementId: "0x" + "1".repeat(64),
    expectedShortCode: "AB12CD",
    geofence: { latitude: 40.71234, longitude: -74.00567, radiusMeters: 75 },
    installation: submission(),
    verification: submission({
      role: "VERIFIER",
      workerRef: "worker-b",
      latitude: 40.71239,
      mediaHash: "0x" + "b".repeat(64),
    }),
    priorMediaHashes: [],
    ...overrides,
  };
}

describe("evaluatePlacement", () => {
  test("approves two independent, fresh, on-site proofs", () => {
    expect(evaluatePlacement(bundle())).toEqual({ approved: true, reasons: [] });
  });

  test("rejects proof captured outside the geofence", () => {
    const verdict = evaluatePlacement(
      bundle({ installation: submission({ latitude: 40.73234 }) }),
    );
    expect(verdict.approved).toBe(false);
    expect(verdict.reasons).toContain("INSTALLER:OUTSIDE_GEOFENCE");
  });

  test("rejects the wrong QR code", () => {
    const verdict = evaluatePlacement(
      bundle({ verification: submission({ role: "VERIFIER", workerRef: "worker-b", scannedShortCode: "ZZ99", mediaHash: "0x" + "c".repeat(64) }) }),
    );
    expect(verdict.reasons).toContain("VERIFIER:WRONG_QR");
  });

  test("rejects an expired challenge", () => {
    const verdict = evaluatePlacement(
      bundle({ installation: submission({ capturedAt: new Date(now + 5 * 60_000).toISOString() }) }),
    );
    expect(verdict.reasons).toContain("INSTALLER:CHALLENGE_EXPIRED");
  });

  test("rejects self-verification", () => {
    const verdict = evaluatePlacement(
      bundle({ verification: submission({ role: "VERIFIER", mediaHash: "0x" + "d".repeat(64) }) }),
    );
    expect(verdict.reasons).toContain("SELF_VERIFICATION");
  });

  test("rejects media reused from another placement", () => {
    const verdict = evaluatePlacement(bundle({ priorMediaHashes: ["0x" + "a".repeat(64)] }));
    expect(verdict.reasons).toContain("INSTALLER:DUPLICATE_MEDIA");
  });

  test("rejects a placement without verifier proof", () => {
    const verdict = evaluatePlacement(bundle({ verification: null }));
    expect(verdict.reasons).toEqual(["MISSING_VERIFICATION"]);
  });
});
