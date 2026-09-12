import { ApiError } from "@/lib/http/api-error";

/** World routes each environment to its own host; sandbox is not staging. */
export type WorldEnvironment = "production" | "staging" | "sandbox";

export type WorldConfig = {
  appId: string;
  rpId: string;
  action: string;
  signingKey: string;
  environment: WorldEnvironment;
  verifyUrl: string;
};

/** How long a signed rp_context stays usable, in seconds. */
export const RP_CONTEXT_TTL_SECONDS = 300;

/**
 * Whether the Selfie Check gate is live. Selfie Check (Beta) is access-gated by
 * World, so until the app is flagged this stays false and every job action
 * behaves exactly as it did before.
 */
export function isSelfieCheckEnabled() {
  return process.env.WORLD_SELFIE_CHECK_ENABLED === "true";
}

function read(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

export function getWorldConfig(): WorldConfig {
  const appId = read("NEXT_PUBLIC_WORLD_APP_ID");
  const signingKey = read("WORLD_RP_SIGNING_KEY");

  if (!appId || !signingKey) {
    throw new ApiError(
      500,
      "WORLD_NOT_CONFIGURED",
      "World ID is not configured on this server.",
    );
  }

  // rp_id is preferred by the v4 API; app_id stays accepted for compatibility.
  const rpId = read("WORLD_RP_ID") ?? appId;
  const requested = read("NEXT_PUBLIC_WORLD_ENVIRONMENT");
  const environment: WorldEnvironment =
    requested === "production" || requested === "staging" ? requested : "sandbox";

  return {
    appId,
    rpId,
    action: read("NEXT_PUBLIC_WORLD_ACTION") ?? "worker-selfie-check",
    signingKey,
    environment,
    // Sandbox proofs are checked by the production verify endpoint too.
    verifyUrl: `https://developer.world.org/api/v4/verify/${rpId}`,
  };
}
