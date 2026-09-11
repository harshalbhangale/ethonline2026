import { requireWorkerContext } from "@/lib/auth/require-worker";
import { apiErrorResponse } from "@/lib/http/api-error";
import { getWallet } from "@/lib/jobs/worker-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Earnings released by the escrow, pending work and the payout wallet. */
export async function GET(request: Request) {
  try {
    const context = await requireWorkerContext(request);
    return Response.json(await getWallet(context));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
