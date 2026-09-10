import { requireWorkerContext } from "@/lib/auth/require-worker";
import { ApiError, apiErrorResponse, readJsonBody } from "@/lib/http/api-error";
import {
  acceptCheck,
  acceptPlacement,
  confirmPlacement,
  rejectPlacement,
  submitProof,
} from "@/lib/jobs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const context = await requireWorkerContext(request);
    const { jobId } = await params;
    const body = (await readJsonBody(request)) as Record<string, unknown>;
    const action = body.action;

    switch (action) {
      case "accept-placement":
        return Response.json({ job: await acceptPlacement(context, jobId) });

      case "submit-proof":
        return Response.json({
          job: await submitProof(context, jobId, {
            photoPath:
              typeof body.photoPath === "string" ? body.photoPath : undefined,
            latitude:
              typeof body.latitude === "number" ? body.latitude : undefined,
            longitude:
              typeof body.longitude === "number" ? body.longitude : undefined,
          }),
        });

      case "accept-check":
        return Response.json({ job: await acceptCheck(context, jobId) });

      case "confirm":
        return Response.json({ job: await confirmPlacement(context, jobId) });

      case "reject":
        return Response.json({
          job: await rejectPlacement(
            context,
            jobId,
            typeof body.reason === "string" ? body.reason : undefined,
          ),
        });

      default:
        throw new ApiError(400, "UNKNOWN_ACTION", "Unknown job action.");
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
