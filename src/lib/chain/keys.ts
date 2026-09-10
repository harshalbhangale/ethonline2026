import { keccak256, toBytes, type Hex } from "viem";

/**
 * Escrow keys are derived from database IDs, so a campaign or placement maps to
 * exactly one onchain record without storing any business data onchain.
 */
export function campaignEscrowKey(campaignId: string): Hex {
  return keccak256(toBytes(`stickerbomb:campaign:${campaignId}`));
}

export function placementEscrowKey(placementId: string): Hex {
  return keccak256(toBytes(`stickerbomb:placement:${placementId}`));
}
