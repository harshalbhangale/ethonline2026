import { resolveAppUrl } from "@/lib/assets/app-url";
import { generateCampaignAssets } from "@/lib/assets/service";
import { requireBrandContext } from "@/lib/auth/require-brand";
import { apiErrorResponse } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;
    const appUrl = resolveAppUrl(request);

    return Response.json({
      assets: await generateCampaignAssets(context, id, appUrl),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
