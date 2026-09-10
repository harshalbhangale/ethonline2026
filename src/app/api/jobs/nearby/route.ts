import { z } from "zod";
import { requireWorkerContext } from "@/lib/auth/require-worker";
import { apiErrorResponse } from "@/lib/http/api-error";
import { listNearbyJobs } from "@/lib/jobs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const originSchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: "Provide both lat and lng, or neither.",
  });

/** Open jobs, sorted by distance when the worker shares a foreground location. */
export async function GET(request: Request) {
  try {
    const context = await requireWorkerContext(request);
    const params = new URL(request.url).searchParams;
    const origin = originSchema.parse({
      lat: params.get("lat") ?? undefined,
      lng: params.get("lng") ?? undefined,
    });

    return Response.json(
      await listNearbyJobs(
        context,
        origin.lat !== undefined && origin.lng !== undefined
          ? { latitude: origin.lat, longitude: origin.lng }
          : null,
      ),
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
