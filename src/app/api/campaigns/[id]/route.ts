import { requireBrandContext } from "@/lib/auth/require-brand";
import { campaignUpdateSchema } from "@/lib/campaigns/schemas";
import { getCampaign, updateCampaign } from "@/lib/campaigns/service";
import { apiErrorResponse, readJsonBody } from "@/lib/http/api-error";
import { timed } from "@/lib/perf";

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
  const startedAt = Date.now();
  try {
    const context = await timed("campaign.PATCH requireBrandContext", () =>
      requireBrandContext(request),
    );
    const { id } = await params;
    const input = campaignUpdateSchema.parse(await readJsonBody(request));
    const campaign = await timed("campaign.PATCH updateCampaign", () =>
      updateCampaign(context, id, input),
    );
    console.log(`[timing] campaign.PATCH total ${Date.now() - startedAt}ms`);

    return Response.json({ campaign });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
