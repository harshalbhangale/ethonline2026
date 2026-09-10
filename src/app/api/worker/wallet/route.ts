import { requireWorkerContext } from "@/lib/auth/require-worker";
import { apiErrorResponse } from "@/lib/http/api-error";
import { getWallet } from "@/lib/jobs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await requireWorkerContext(request);
    return Response.json(await getWallet(context));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
