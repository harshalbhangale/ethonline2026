import { ApiError } from "@/lib/http/api-error";
import { getWorldConfig } from "@/lib/world/config";

/** A legacy 3.0 response item, matching IDKit's `ResponseItemV3`. */
export type WorldProofResponseItem = {
  identifier: string;
  signal_hash?: string;
  proof: string;
  merkle_root: string;
  nullifier: string;
};

/** Forwarded verbatim from IDKit; identifiers are never remapped. */
export type WorldProofPayload = {
  protocol_version: "3.0";
  nonce: string;
  action?: string;
  action_description?: string;
  responses: WorldProofResponseItem[];
  user_presence_completed?: boolean;
  environment?: string;
};

export type WorldVerifyResult = {
  nullifier: string;
  identifier: string;
};

type VerifyApiResponse = {
  success?: boolean;
  nullifier?: string;
  code?: string;
  detail?: string;
  results?: {
    identifier: string;
    success: boolean;
    nullifier?: string;
    code?: string;
    detail?: string;
  }[];
};

/**
 * Verifies a Selfie Check proof with World's v4 endpoint.
 *
 * Sandbox proofs go to the same production verify endpoint; only `environment`
 * differs, and it is forwarded as its own value rather than folded into
 * "staging" (World routes sandbox to its own host). The proof is forwarded as
 * IDKit produced it, because rebuilding fields here would invalidate it. The
 * action is pinned server-side so a client cannot verify a different action.
 */
export async function verifySelfieCheckProof(
  payload: WorldProofPayload,
): Promise<WorldVerifyResult> {
  const config = getWorldConfig();

  let response: Response;
  try {
    response = await fetch(config.verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        action: config.action,
        environment: config.environment,
      }),
    });
  } catch {
    throw new ApiError(502, "WORLD_UNREACHABLE", "Could not reach World ID. Try again.");
  }

  const body = (await response.json().catch(() => ({}))) as VerifyApiResponse;

  if (!response.ok || !body.success) {
    const failed = body.results?.find((item) => !item.success);
    throw new ApiError(
      400,
      "SELFIE_CHECK_FAILED",
      failed?.detail ?? body.detail ?? "That check could not be verified.",
      { code: failed?.code ?? body.code },
    );
  }

  const verified = body.results?.find((item) => item.success) ?? null;
  const nullifier = verified?.nullifier ?? body.nullifier;

  if (!nullifier) {
    throw new ApiError(400, "SELFIE_CHECK_FAILED", "That check returned no identity.");
  }

  return { nullifier, identifier: verified?.identifier ?? "selfie" };
}
