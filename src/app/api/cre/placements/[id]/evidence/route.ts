import { apiErrorResponse } from "@/lib/http/api-error";
import { assertCreRequest, buildEvidenceBundle } from "@/lib/verification/evidence-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Exact evidence for the confidential CRE workflow only. */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    assertCreRequest(request);
    const { id } = await params;

    return Response.json(await buildEvidenceBundle(id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
