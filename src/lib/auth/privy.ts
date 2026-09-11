import { createHash } from "node:crypto";
import { PrivyClient } from "@privy-io/node";
import { ApiError } from "@/lib/http/api-error";

let privyClient: PrivyClient | undefined;

/** Shared server-side Privy client for auth, wallets and policies. */
export function getPrivyClient() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    throw new ApiError(
      500,
      "AUTH_NOT_CONFIGURED",
      "Privy server authentication is not configured.",
    );
  }

  // Fail fast rather than holding a brand's request open for minutes when a
  // Privy endpoint is slow.
  privyClient ??= new PrivyClient({
    appId,
    appSecret,
    timeout: 30_000,
    maxRetries: 1,
  });
  return privyClient;
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
  }

  const [scheme, token, ...rest] = authorization.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) {
    throw new ApiError(
      401,
      "INVALID_AUTH_HEADER",
      "The authorization header is invalid.",
    );
  }

  return token;
}

type VerifiedClaims = Awaited<
  ReturnType<ReturnType<ReturnType<PrivyClient["utils"]>["auth"]>["verifyAccessToken"]>
>;

/**
 * Recently verified tokens, keyed by digest rather than the token itself.
 *
 * One screen can fire half a dozen authenticated requests, and without this
 * every one of them waits on its own round trip to Privy. The window is short
 * so a signed-out session stops working promptly; the cost is that a token
 * revoked mid-window keeps working until it lapses.
 */
const verified = new Map<string, { claims: VerifiedClaims; expiresAt: number }>();

const VERIFY_CACHE_MS = 30_000;
const VERIFY_CACHE_MAX = 500;

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function readCached(key: string) {
  const hit = verified.get(key);
  if (!hit) return null;

  if (hit.expiresAt <= Date.now()) {
    verified.delete(key);
    return null;
  }

  return hit.claims;
}

function remember(key: string, claims: VerifiedClaims) {
  // Bounded, and the oldest insertion is the first key Map iterates.
  if (verified.size >= VERIFY_CACHE_MAX) {
    const oldest = verified.keys().next();
    if (!oldest.done) verified.delete(oldest.value);
  }

  verified.set(key, { claims, expiresAt: Date.now() + VERIFY_CACHE_MS });
}

export async function verifyPrivyRequest(request: Request) {
  const token = readBearerToken(request);
  const key = digest(token);

  const cached = readCached(key);
  if (cached) return cached;

  try {
    const claims = await getPrivyClient().utils().auth().verifyAccessToken(token);
    remember(key, claims);
    return claims;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      401,
      "INVALID_ACCESS_TOKEN",
      "Your session is invalid or expired. Please sign in again.",
    );
  }
}
