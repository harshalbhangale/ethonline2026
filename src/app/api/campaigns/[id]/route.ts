import { requireBrandContext } from "@/lib/auth/require-brand";
import { campaignUpdateSchema } from "@/lib/campaigns/schemas";
import { getCampaign, updateCampaign } from "@/lib/campaigns/service";
import { apiErrorResponse, readJsonBody } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;
    const campaign = await getCampaign(context, id);

    return Response.json({ campaign });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;
    const input = campaignUpdateSchema.parse(await readJsonBody(request));
    const campaign = await updateCampaign(context, id, input);

    return Response.json({ campaign });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
