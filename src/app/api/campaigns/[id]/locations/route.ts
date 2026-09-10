import { z } from "zod";
import { requireBrandContext } from "@/lib/auth/require-brand";
import { apiErrorResponse, readJsonBody } from "@/lib/http/api-error";
import {
  getCampaignLocationIds,
  setCampaignLocations,
} from "@/lib/locations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const bodySchema = z
  .object({
    strategy: z.enum(["AUTO_APPROVED", "MANUAL_SELECTION"]),
    locationIds: z.array(z.string().min(1)).max(1_000).default([]),
  })
  .refine(
    (value) =>
      value.strategy === "AUTO_APPROVED" || value.locationIds.length > 0,
    {
      message: "Select at least one approved location.",
      path: ["locationIds"],
    },
  );

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;

    return Response.json({
      selectedLocationIds: await getCampaignLocationIds(context, id),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;
    const input = bodySchema.parse(await readJsonBody(request));
    const result = await setCampaignLocations(context, id, input);

    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
