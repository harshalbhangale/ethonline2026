import { z } from "zod";
import { requireWorkerContext } from "@/lib/auth/require-worker";
import { apiErrorResponse, readJsonBody } from "@/lib/http/api-error";
import { recordPing } from "@/lib/jobs/worker-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pingSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().max(100_000).optional(),
});

/**
 * Live location while a worker holds a job, sent every few seconds. Returns
 * distance, whether they are inside the fence and whether "Stick & verify"
 * can unlock.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const context = await requireWorkerContext(request);
    const { jobId } = await params;
    const ping = pingSchema.parse(await readJsonBody(request));

    return Response.json(await recordPing(context, jobId, ping));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
