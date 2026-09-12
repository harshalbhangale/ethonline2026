import {
  requireUnverifiedWorkerContext,
  requireWorkerContext,
} from "@/lib/auth/require-worker";
import { apiErrorResponse } from "@/lib/http/api-error";
import { getWorkerProfileSettings, setPrimaryWallet } from "@/lib/worker/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await requireUnverifiedWorkerContext(request);
    return Response.json(await getWorkerProfileSettings(context));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/** Sets or clears the wallet the daily payout sweep sends earnings to. */
export async function PUT(request: Request) {
  try {
    const context = await requireWorkerContext(request);
    const body = (await request.json()) as { primaryWalletAddress?: string | null };
    const address =
      typeof body.primaryWalletAddress === "string" && body.primaryWalletAddress.trim().length > 0
        ? body.primaryWalletAddress.trim()
        : null;

    return Response.json(await setPrimaryWallet(context, address));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
