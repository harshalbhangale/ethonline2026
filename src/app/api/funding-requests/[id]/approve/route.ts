import { resolveAppUrl } from "@/lib/assets/app-url";
import { requireBrandContext } from "@/lib/auth/require-brand";
import { approveFundingRequest } from "@/lib/funding/service";
import { apiErrorResponse } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** A second member approves; the Privy treasury then funds the escrow. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;

    return Response.json(
      await approveFundingRequest(context, id, resolveAppUrl(request)),
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
