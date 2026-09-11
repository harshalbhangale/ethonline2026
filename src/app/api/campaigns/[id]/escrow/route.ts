import { requireBrandContext } from "@/lib/auth/require-brand";
import { apiErrorResponse } from "@/lib/http/api-error";
import { getCampaignEscrow, syncCampaignOnchain } from "@/lib/onchain/placements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Live escrow balances and the campaign's onchain history. */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;

    return Response.json({ escrow: await getCampaignEscrow(context, id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/** Registers any missing placements and mirrors settlements from chain. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;

    return Response.json({ escrow: await syncCampaignOnchain(context, id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
