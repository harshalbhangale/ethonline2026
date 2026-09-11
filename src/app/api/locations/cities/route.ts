import { requireBrandContext } from "@/lib/auth/require-brand";
import { apiErrorResponse } from "@/lib/http/api-error";
import { listServiceableCities } from "@/lib/locations/service";

export const runtime = "nodejs";

/**
 * Cities the wizard is allowed to suggest.
 *
 * Inventory changes rarely, so this is cached briefly rather than recomputed
 * for every brand opening the location step.
 */
export const revalidate = 300;

export async function GET(request: Request) {
  try {
    await requireBrandContext(request);

    return Response.json({ cities: await listServiceableCities() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
