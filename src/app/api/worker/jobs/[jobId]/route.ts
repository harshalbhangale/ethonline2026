import { requireWorkerContext } from "@/lib/auth/require-worker";
import { apiErrorResponse } from "@/lib/http/api-error";
import { getTask } from "@/lib/jobs/worker-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const context = await requireWorkerContext(request);
    const { jobId } = await params;
    return Response.json({ job: await getTask(context, jobId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
