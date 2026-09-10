import { listCampaignAssets } from "@/lib/assets/service";
import { requireBrandContext } from "@/lib/auth/require-brand";
import { apiErrorResponse } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;

    return Response.json({ assets: await listCampaignAssets(context, id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
