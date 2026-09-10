import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  EvidenceStatus,
  JobRole,
  JobStatus,
  PlacementStatus,
  VerificationRunStatus,
  type Evidence,
} from "@/generated/prisma/client";
import { recordChainTransaction } from "@/lib/chain/ledger";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import { syncPlacementFromChain } from "@/lib/onchain/placements";

/**
 * Endpoints used only by the Chainlink CRE confidential workflow.
 *
 * They return exact coordinates, worker identities and media fingerprints, so
 * they are authenticated with a secret that is released by the Vault DON only
 * inside the TEE, and are never called by browsers.
 */

/** Proof counts when captured within this radius of the approved surface. */
export const GEOFENCE_RADIUS_METERS = 75;

export function assertCreRequest(request: Request) {
  const expected = process.env.STICKERBOMB_EVIDENCE_API_KEY?.trim();
  if (!expected) {
    throw new ApiError(503, "CRE_NOT_CONFIGURED", "Confidential verification is not configured.");
  }

  const provided = Buffer.from(request.headers.get("x-stickerbomb-cre-key")?.trim() ?? "");
  const secret = Buffer.from(expected);
  if (provided.length !== secret.length || !timingSafeEqual(provided, secret)) {
    throw new ApiError(401, "INVALID_CRE_KEY", "Unauthorized.");
  }
}

function toSubmission(evidence: Evidence) {
  return {
    role: evidence.role,
    workerRef: evidence.workerUserId,
    scannedShortCode: evidence.scannedShortCode,
    latitude: evidence.latitude,
    longitude: evidence.longitude,
    accuracyMeters: evidence.accuracyMeters,
    capturedAt: evidence.capturedAt.toISOString(),
    challengeSymbol: evidence.challengeSymbol,
    challengeResponse: evidence.challengeResponse,
    challengeIssuedAt: evidence.challengeIssuedAt.toISOString(),
    challengeExpiresAt: evidence.challengeExpiresAt.toISOString(),
    mediaHash: evidence.mediaHash.toLowerCase(),
  };
}

export async function buildEvidenceBundle(placementId: string) {
  const prisma = getPrismaClient();
  const placement = await prisma.placement.findUnique({
    where: { id: placementId },
    include: {
      asset: { select: { shortCode: true } },
      location: { select: { latitude: true, longitude: true } },
      evidence: {
        where: { status: EvidenceStatus.SUBMITTED },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!placement) throw new ApiError(404, "PLACEMENT_NOT_FOUND", "Placement not found.");
  if (!placement.onchainPlacementId) {
    throw new ApiError(409, "PLACEMENT_NOT_REGISTERED", "Placement is not registered in escrow.");
  }

  const installation = placement.evidence.find((e) => e.role === JobRole.INSTALLER) ?? null;
  const verification = placement.evidence.find((e) => e.role === JobRole.VERIFIER) ?? null;
  const hashes = [installation?.mediaHash, verification?.mediaHash].flatMap((hash) =>
    hash ? [hash] : [],
  );

  const reused = hashes.length
    ? await prisma.evidence.findMany({
        where: { mediaHash: { in: hashes }, placementId: { not: placementId } },
        select: { mediaHash: true },
      })
    : [];

  return {
    placementId,
    onchainPlacementId: placement.onchainPlacementId,
    expectedShortCode: placement.asset.shortCode,
    geofence: {
      latitude: placement.location.latitude,
      longitude: placement.location.longitude,
      radiusMeters: GEOFENCE_RADIUS_METERS,
    },
    installation: installation ? toSubmission(installation) : null,
    verification: verification ? toSubmission(verification) : null,
    priorMediaHashes: [...new Set(reused.map((row) => row.mediaHash.toLowerCase()))],
  };
}

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const verdictSchema = z.object({
  approved: z.boolean(),
  reasons: z.array(z.string().max(64)).max(20),
  evidenceHash: hex32,
  txHash: hex32.optional(),
});

function rolesToRedo(reasons: string[]) {
  const both = reasons.some((r) => r === "SELF_VERIFICATION" || r === "DUPLICATE_MEDIA");
  return {
    installer: both || reasons.some((r) => r.startsWith("INSTALLER:") || r === "MISSING_INSTALLATION"),
    verifier: both || reasons.some((r) => r.startsWith("VERIFIER:") || r === "MISSING_VERIFICATION"),
  };
}

/** Records the enclave's verdict for the brand timeline and worker follow-up. */
export async function recordVerdict(placementId: string, body: unknown) {
  const verdict = verdictSchema.parse(body);
  const prisma = getPrismaClient();
  const placement = await prisma.placement.findUnique({
    where: { id: placementId },
    include: { campaign: { select: { organizationId: true } } },
  });
  if (!placement) throw new ApiError(404, "PLACEMENT_NOT_FOUND", "Placement not found.");

  const run = await prisma.verificationRun.findFirst({
    where: {
      placementId,
      status: { in: [VerificationRunStatus.QUEUED, VerificationRunStatus.RUNNING] },
    },
    orderBy: { createdAt: "desc" },
  });

  const verdictData = {
    approved: verdict.approved,
    reasons: verdict.reasons,
    evidenceHash: verdict.evidenceHash,
    ...(verdict.txHash ? { txHash: verdict.txHash } : {}),
  };

  if (run) {
    await prisma.verificationRun.update({ where: { id: run.id }, data: verdictData });
  } else {
    // The verdict arrived without an app-started run: a deployed workflow or
    // a CRE CLI run started outside the app.
    await prisma.verificationRun.create({
      data: {
        placementId,
        mode: "cre-external",
        status: VerificationRunStatus.SUCCEEDED,
        startedAt: new Date(),
        finishedAt: new Date(),
        ...verdictData,
      },
    });
  }

  if (verdict.approved) {
    await syncPlacementFromChain(placementId);
    return { ok: true };
  }

  if (verdict.txHash) {
    await recordChainTransaction({
      kind: "PLACEMENT_REJECTED",
      txHash: verdict.txHash,
      status: "CONFIRMED",
      organizationId: placement.campaign.organizationId,
      campaignId: placement.campaignId,
      placementId,
    });
  }

  // Rejected: payment stays locked in escrow until a recapture passes.
  const redo = rolesToRedo(verdict.reasons);
  const roles = [
    ...(redo.installer ? [JobRole.INSTALLER] : []),
    ...(redo.verifier ? [JobRole.VERIFIER] : []),
  ];

  await prisma.$transaction(async (transaction) => {
    for (const role of roles) {
      const reason =
        verdict.reasons.find((r) => r.startsWith(`${role}:`)) ?? verdict.reasons[0] ?? "REJECTED";
      await transaction.evidence.updateMany({
        where: { placementId, role, status: EvidenceStatus.SUBMITTED },
        data: { status: EvidenceStatus.REJECTED, rejectionReason: reason.slice(0, 64) },
      });
      await transaction.job.updateMany({
        where: { placementId, role, status: JobStatus.PROOF_SUBMITTED },
        data: { status: JobStatus.REJECTED_PROOF, resolvedAt: new Date() },
      });
    }
    await transaction.placement.updateMany({
      where: { id: placementId, status: PlacementStatus.READY_FOR_FINAL_VERIFICATION },
      data: { status: PlacementStatus.NEEDS_RECAPTURE },
    });
  });

  return { ok: true };
}
