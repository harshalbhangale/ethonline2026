import { requireBrandContext } from "@/lib/auth/require-brand";
import { apiErrorResponse } from "@/lib/http/api-error";
import { topUpTreasury } from "@/lib/treasury/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Testnet only: mints demo stablecoin into the treasury. */
export async function POST(request: Request) {
  try {
    const context = await requireBrandContext(request);

    return Response.json({ treasury: await topUpTreasury(context) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
