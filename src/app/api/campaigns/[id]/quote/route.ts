import { requireBrandContext } from "@/lib/auth/require-brand";
import { apiErrorResponse } from "@/lib/http/api-error";
import {
  createCampaignQuote,
  getLatestCampaignQuote,
} from "@/lib/quotes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;

    return Response.json({ quote: await getLatestCampaignQuote(context, id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;

    return Response.json({ quote: await createCampaignQuote(context, id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
