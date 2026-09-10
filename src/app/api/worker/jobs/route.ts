import { requireWorkerContext } from "@/lib/auth/require-worker";
import { apiErrorResponse } from "@/lib/http/api-error";
import {
  listCheckableJobs,
  listMyJobs,
  listPlaceableJobs,
} from "@/lib/jobs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await requireWorkerContext(request);
    const tab = new URL(request.url).searchParams.get("tab");

    if (tab === "check") {
      return Response.json({ jobs: await listCheckableJobs(context) });
    }

    if (tab === "mine") {
      return Response.json({ jobs: await listMyJobs(context) });
    }

    return Response.json({ jobs: await listPlaceableJobs(context) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
