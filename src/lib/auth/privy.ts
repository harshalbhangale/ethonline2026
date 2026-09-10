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

export async function verifyPrivyRequest(request: Request) {
  const token = readBearerToken(request);

  try {
    return await getPrivyClient().utils().auth().verifyAccessToken(token);
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
