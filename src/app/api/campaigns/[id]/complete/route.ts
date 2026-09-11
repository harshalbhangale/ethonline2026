import { requireBrandContext } from "@/lib/auth/require-brand";
import { endCampaign } from "@/lib/campaigns/service";
import { apiErrorResponse } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Ends a running campaign; its results stay on the campaign page. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;

    return Response.json({ campaign: await endCampaign(context, id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
