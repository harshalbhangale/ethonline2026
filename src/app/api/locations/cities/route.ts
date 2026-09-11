import { requireBrandContext } from "@/lib/auth/require-brand";
import { apiErrorResponse } from "@/lib/http/api-error";
import { listServiceableCities } from "@/lib/locations/service";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/** Cities the wizard is allowed to suggest. Cached in the service. */

export async function GET(request: Request) {
  try {
    await requireBrandContext(request);

    return Response.json({ cities: await listServiceableCities() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
