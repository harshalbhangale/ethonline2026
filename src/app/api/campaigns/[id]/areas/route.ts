import { z } from "zod";
import { requireBrandContext } from "@/lib/auth/require-brand";
import { apiErrorResponse, readJsonBody } from "@/lib/http/api-error";
import { getCampaignAreas, setCampaignAreas } from "@/lib/locations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const bodySchema = z.object({
  areas: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(160),
        latitude: z.coerce.number().min(-90).max(90),
        longitude: z.coerce.number().min(-180).max(180),
        radiusMetres: z.coerce.number().int().min(100).max(50_000),
      }),
    )
    .min(1)
    .max(12),
});

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;

    return Response.json({ areas: await getCampaignAreas(context, id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;
    const input = bodySchema.parse(await readJsonBody(request));

    return Response.json(await setCampaignAreas(context, id, input.areas));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
