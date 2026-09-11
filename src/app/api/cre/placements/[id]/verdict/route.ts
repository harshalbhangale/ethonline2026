import { apiErrorResponse, readJsonBody } from "@/lib/http/api-error";
import { assertCreRequest, recordVerdict } from "@/lib/verification/evidence-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Verdict callback from the confidential CRE workflow. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertCreRequest(request);
    const { id } = await params;

    return Response.json(await recordVerdict(id, await readJsonBody(request)));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
