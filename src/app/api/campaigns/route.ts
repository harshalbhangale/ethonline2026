import { requireBrandContext } from "@/lib/auth/require-brand";
import { campaignCreateSchema } from "@/lib/campaigns/schemas";
import { createCampaign, listCampaigns } from "@/lib/campaigns/service";
import { apiErrorResponse, readJsonBody } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await requireBrandContext(request);
    return Response.json(await listCampaigns(context));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireBrandContext(request);
    const input = campaignCreateSchema.parse(await readJsonBody(request));
    const campaign = await createCampaign(context, input);

    return Response.json({ campaign }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
