import { getScanAnalytics } from "@/lib/analytics/service";
import { requireBrandContext } from "@/lib/auth/require-brand";
import { apiErrorResponse } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await requireBrandContext(request);

    return Response.json(await getScanAnalytics(context));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
