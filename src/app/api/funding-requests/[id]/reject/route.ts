import { requireBrandContext } from "@/lib/auth/require-brand";
import { rejectFundingRequest } from "@/lib/funding/service";
import { apiErrorResponse } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;
    await rejectFundingRequest(context, id);

    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
