import { z } from "zod";
import { requireBrandContext } from "@/lib/auth/require-brand";
import { getCampaign } from "@/lib/campaigns/service";
import { apiErrorResponse, readJsonBody } from "@/lib/http/api-error";
import { saveCampaignPlacementPlan } from "@/lib/locations/service";

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
  strategy: z.enum(["AUTO_APPROVED", "MANUAL_SELECTION"]),
  assetType: z.enum(["QR_NORMAL", "QR_MAGIC", "QR_VERY_MAGIC", "NFC"]).optional(),
  locationIds: z.array(z.string().min(1)).max(1_000).default([]),
});

/** The wizard's placement step, saved in one request. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;
    const input = bodySchema.parse(await readJsonBody(request));
    const { selectedLocationIds } = await saveCampaignPlacementPlan(context, id, input);

    return Response.json({
      campaign: await getCampaign(context, id),
      selectedLocationIds,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
