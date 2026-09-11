import { z } from "zod";
import { requireBrandContext } from "@/lib/auth/require-brand";
import {
  getCampaignArtwork,
  saveCampaignArtwork,
  startArtworkUpload,
} from "@/lib/campaigns/artwork";
import { apiErrorResponse, readJsonBody } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upload-url"),
    contentType: z.string().max(60),
  }),
  z.object({
    action: z.literal("save"),
    path: z.string().min(1).max(300),
  }),
]);

/** The artwork the brand uploaded, as a short-lived preview URL. */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;

    return Response.json(await getCampaignArtwork(context, id));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/**
 * Two steps of one flow: hand the browser a signed upload URL, then record the
 * finished upload against the campaign.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id } = await params;
    const body = bodySchema.parse(await readJsonBody(request));

    if (body.action === "upload-url") {
      return Response.json(
        await startArtworkUpload(context, id, body.contentType),
      );
    }

    return Response.json(await saveCampaignArtwork(context, id, body.path));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
