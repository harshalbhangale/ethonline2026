import { keccak256, toBytes, type Hex } from "viem";
import { campaignEscrowAbi } from "@/lib/chain/abis";
import { waitForSuccess, withOperator } from "@/lib/chain/client";
import { getChainConfig } from "@/lib/chain/config";
import { markChainTransaction, recordChainTransaction } from "@/lib/chain/ledger";
import { getPrismaClient } from "@/lib/database/prisma";
import {
  defaultCheckOptions,
  evaluatePlacement,
  isSpotCheckSelected,
  type EvidenceBundle,
} from "@/lib/verification/checks";
import { buildEvidenceBundle, recordVerdict } from "@/lib/verification/evidence-api";
import {
  isLenientVerification,
  minDwellSeconds,
  spotCheckPercent,
} from "@/lib/verification/leniency";

/**
 * Stand-in for the Chainlink CRE workflow while its own service is
 * unreachable — see contracts/src/CampaignEscrow.sol's operatorVerify().
 *
 * The same checks run (evaluatePlacement, a byte-for-byte copy of what the
 * confidential workflow runs), on the same evidence, producing the same kind
 * of verdict. The only thing that changes is who delivers it onchain: our
 * own operator wallet calling operatorVerify(), instead of Chainlink's
 * forwarder relaying a DON-signed report. A poster from the wrong place, a
 * reused photo, or one worker checking their own spot check still fails.
 *
 * Delete this file and its two call sites once CRE access is restored —
 * nothing else in the app depends on it existing.
 */
export function isMockVerificationEnabled() {
  return process.env.STICKERBOMB_MOCK_VERIFICATION?.trim() === "true";
}

/**
 * Matches escrowFor() in onchain/placements.ts exactly — deliberately not
 * imported from there. That module and this one ended up in a circular
 * import chain (through evidence-api.ts) that left escrowFor undefined at
 * runtime despite typechecking cleanly; a one-line duplicate is cheaper
 * than untangling it for a bypass meant to be temporary anyway.
 */
function escrowFor(campaign: { escrowAddress: string | null }): Hex {
  return (campaign.escrowAddress ?? getChainConfig().escrow) as Hex;
}

/** Matches cre/placement-verifier/main.ts's commitEvidence() exactly. */
function commitEvidence(bundle: EvidenceBundle, salt: string): Hex {
  const parts = [
    salt,
    bundle.onchainPlacementId,
    bundle.installation?.mediaHash ?? "",
    bundle.installation?.latitude.toFixed(6) ?? "",
    bundle.installation?.longitude.toFixed(6) ?? "",
    bundle.verification?.mediaHash ?? "",
    bundle.verification?.latitude.toFixed(6) ?? "",
    bundle.verification?.longitude.toFixed(6) ?? "",
  ];
  return keccak256(toBytes(parts.join("|")));
}

export async function runMockVerification(placementId: string) {
  const prisma = getPrismaClient();
  const bundle = (await buildEvidenceBundle(placementId)) as unknown as EvidenceBundle;

  const verdict = evaluatePlacement(bundle, {
    graceSeconds: defaultCheckOptions.graceSeconds,
    minDwellSeconds: minDwellSeconds(),
    lenient: isLenientVerification(),
  });

  const salt = process.env.STICKERBOMB_GEOFENCE_SALT?.trim() ?? "";
  const evidenceHash = commitEvidence(bundle, salt);

  const spotCheck =
    verdict.approved &&
    bundle.mode === "SELF" &&
    isSpotCheckSelected(
      keccak256(toBytes(`${salt}|spot-check|${bundle.onchainPlacementId}`)),
      spotCheckPercent(),
    );

  let txHash: string | undefined;

  // A spot check pays nobody yet, same as the real workflow: nothing is
  // written onchain until the independent check passes too.
  if (!spotCheck) {
    const placement = await prisma.placement.findUniqueOrThrow({
      where: { id: placementId },
      include: { campaign: { select: { organizationId: true, escrowAddress: true } } },
    });
    const escrow = escrowFor(placement.campaign);
    const key = placement.onchainPlacementId as Hex;

    txHash = await withOperator(async (operator) => {
      const hash = await operator.writeContract({
        address: escrow,
        abi: campaignEscrowAbi,
        functionName: "operatorVerify",
        args: [key, verdict.approved, evidenceHash],
      });
      await recordChainTransaction({
        kind: verdict.approved ? "PLACEMENT_VERIFIED" : "PLACEMENT_REJECTED",
        txHash: hash,
        organizationId: placement.campaign.organizationId,
        campaignId: placement.campaignId,
        placementId,
        fromAddress: operator.account.address,
        toAddress: escrow,
      });
      const receipt = await waitForSuccess(hash);
      await markChainTransaction(hash, "CONFIRMED", receipt.blockNumber);
      return hash;
    });
  }

  await recordVerdict(placementId, {
    approved: verdict.approved,
    reasons: verdict.reasons,
    evidenceHash,
    ...(txHash ? { txHash } : {}),
    spotCheck,
  });
}
