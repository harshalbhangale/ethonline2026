import { requireWorkerContext } from "@/lib/auth/require-worker";
import { apiErrorResponse } from "@/lib/http/api-error";
import {
  listCheckableTasks,
  listMyTasks,
  listPlaceableTasks,
} from "@/lib/jobs/worker-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Worker PWA job lists: `?tab=check`, `?tab=mine`, `?tab=all`, or placements by
 * default.
 *
 * The app wants all three lists at once. Asking for them in one request means
 * one authentication instead of three, which on a phone is the difference
 * between a tap feeling instant and feeling broken.
 */
export async function GET(request: Request) {
  try {
    const context = await requireWorkerContext(request);
    const tab = new URL(request.url).searchParams.get("tab");

    if (tab === "all") {
      const [place, check, mine] = await Promise.all([
        listPlaceableTasks(context),
        listCheckableTasks(context),
        listMyTasks(context),
      ]);

      return Response.json({ jobs: place, place, check, mine });
    }

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
