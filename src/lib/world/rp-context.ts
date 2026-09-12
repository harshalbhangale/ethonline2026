import { signRequest } from "@worldcoin/idkit-server";
import { getWorldConfig, RP_CONTEXT_TTL_SECONDS } from "@/lib/world/config";

export type RpContext = {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
};

/**
 * Issues a short-lived signed request context for IDKit.
 *
 * Signing uses World's own `signRequest`, which builds the canonical message
 * (version || nonce || created_at || expires_at || action) and signs it EIP-191
 * over secp256k1. The signing key is server-only and never reaches the client.
 */
export function createRpContext(): RpContext {
  const config = getWorldConfig();
  const key = config.signingKey.startsWith("0x")
    ? config.signingKey.slice(2)
    : config.signingKey;

  const { sig, nonce, createdAt, expiresAt } = signRequest({
    signingKeyHex: key,
    action: config.action,
    ttl: RP_CONTEXT_TTL_SECONDS,
  });

  return {
    rp_id: config.rpId,
    nonce,
    created_at: createdAt,
    expires_at: expiresAt,
    signature: sig,
  };
}
