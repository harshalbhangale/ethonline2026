import { resolveAppUrl } from "@/lib/assets/app-url";
import { requireBrandContext } from "@/lib/auth/require-brand";
import { fundCampaign } from "@/lib/funding/service";
import { apiErrorResponse } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Phase 2 mocked funding. Replaced by onchain escrow in Phase 4. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;
    const appUrl = resolveAppUrl(request);

    return Response.json(await fundCampaign(context, id, appUrl));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
