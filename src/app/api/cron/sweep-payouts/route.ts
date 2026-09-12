import { timingSafeEqual } from "node:crypto";
import { sweepWorkerPayouts } from "@/lib/payouts/sweep";
import { ApiError, apiErrorResponse } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when
 * CRON_SECRET is set in the project's env. Anyone else calling this route
 * without that header is refused.
 */
function assertCronRequest(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    throw new ApiError(503, "CRON_NOT_CONFIGURED", "CRON_SECRET is not set.");
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = Buffer.from(header.replace(/^Bearer\s+/i, "").trim());
  const secret = Buffer.from(expected);

  if (provided.length !== secret.length || !timingSafeEqual(provided, secret)) {
    throw new ApiError(401, "UNAUTHORIZED", "Unauthorized.");
  }
}

/** Daily sweep of every worker's payout wallet into their own primary wallet. */
export async function GET(request: Request) {
  try {
    assertCronRequest(request);
    return Response.json(await sweepWorkerPayouts());
  } catch (error) {
    return apiErrorResponse(error);
  }
}
