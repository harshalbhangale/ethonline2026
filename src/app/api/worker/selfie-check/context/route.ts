import { requireUnverifiedWorkerContext } from "@/lib/auth/require-worker";
import { apiErrorResponse } from "@/lib/http/api-error";
import { getWorldConfig } from "@/lib/world/config";
import { createRpContext } from "@/lib/world/rp-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issues a short-lived signed request context for IDKit.
 *
 * Signing happens here because the RP signing key is server-only; the widget
 * receives the signature and never the key.
 */
export async function GET(request: Request) {
  try {
    await requireUnverifiedWorkerContext(request);
    const config = getWorldConfig();

    return Response.json({
      appId: config.appId,
      action: config.action,
      environment: config.environment,
      rpContext: createRpContext(),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
