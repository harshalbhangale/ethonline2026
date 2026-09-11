import { requireBrandContext } from "@/lib/auth/require-brand";
import { apiErrorResponse } from "@/lib/http/api-error";
import { getTreasury } from "@/lib/treasury/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The organization's Privy treasury: wallet, policy, balances and history. */
export async function GET(request: Request) {
  try {
    const context = await requireBrandContext(request);

    return Response.json({ treasury: await getTreasury(context) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
