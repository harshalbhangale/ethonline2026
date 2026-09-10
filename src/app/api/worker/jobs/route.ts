import { requireWorkerContext } from "@/lib/auth/require-worker";
import { apiErrorResponse } from "@/lib/http/api-error";
import { listWorkerJobs } from "@/lib/jobs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The caller's accepted jobs, with exact placement details revealed. */
export async function GET(request: Request) {
  try {
    const context = await requireWorkerContext(request);

    return Response.json(await listWorkerJobs(context));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
