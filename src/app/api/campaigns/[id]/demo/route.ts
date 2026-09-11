import { z } from "zod";
import { resolveAppUrl } from "@/lib/assets/app-url";
import { requireBrandContext } from "@/lib/auth/require-brand";
import { demoActions, runDemoAction } from "@/lib/demo/service";
import { apiErrorResponse, readJsonBody } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Demo steps can send several Sepolia transactions.
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

const demoActionSchema = z.object({
  action: z.enum(demoActions),
  placementId: z.string().min(1).max(40).optional(),
  fraudulent: z.boolean().optional(),
});

/** Development-only demo controls. Returns 404 unless demo mode is on. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;
    const input = demoActionSchema.parse(await readJsonBody(request));

    return Response.json(
      await runDemoAction(context, id, input, resolveAppUrl(request)),
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
