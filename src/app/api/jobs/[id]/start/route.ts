import { requireWorkerContext } from "@/lib/auth/require-worker";
import { apiErrorResponse } from "@/lib/http/api-error";
import { startJob } from "@/lib/jobs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const context = await requireWorkerContext(request);
    const { id } = await params;

    return Response.json({ job: await startJob(context, id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
