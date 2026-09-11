import { requireBrandContext } from "@/lib/auth/require-brand";
import { apiErrorResponse } from "@/lib/http/api-error";
import { getLiveCampaign } from "@/lib/placements/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Venues and live worker positions for the brand's tracking map. */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;

    return Response.json(await getLiveCampaign(context, id));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
