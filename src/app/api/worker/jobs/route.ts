import { requireWorkerContext } from "@/lib/auth/require-worker";
import { apiErrorResponse } from "@/lib/http/api-error";
import {
  listCheckableTasks,
  listMyTasks,
  listPlaceableTasks,
} from "@/lib/jobs/worker-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Worker PWA job lists: `?tab=check`, `?tab=mine`, or placements by default. */
export async function GET(request: Request) {
  try {
    const context = await requireWorkerContext(request);
    const tab = new URL(request.url).searchParams.get("tab");

    if (tab === "check") {
      return Response.json({ jobs: await listCheckableTasks(context) });
    }

    if (tab === "mine") {
      return Response.json({ jobs: await listMyTasks(context) });
    }

    return Response.json({ jobs: await listPlaceableTasks(context) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
