import { z } from "zod";
import { requireBrandContext } from "@/lib/auth/require-brand";
import { demoActions, runDemoAction } from "@/lib/demo/service";
import { apiErrorResponse, readJsonBody } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const demoActionSchema = z.object({ action: z.enum(demoActions) });

/** Development-only demo controls. Returns 404 unless demo mode is on. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;
    const { action } = demoActionSchema.parse(await readJsonBody(request));

    return Response.json(await runDemoAction(context, id, action));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
