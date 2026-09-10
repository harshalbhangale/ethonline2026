import { renderPosterPng } from "@/lib/assets/qr";
import { getOwnedAssetByShortCode } from "@/lib/assets/service";
import { requireBrandContext } from "@/lib/auth/require-brand";
import { apiErrorResponse } from "@/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string; code: string }>;
};

/**
 * Renders the printable poster on demand.
 *
 * Rendering is deterministic from the stored short code, so no object storage is
 * required and the same asset always produces the same poster.
 */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const context = await requireBrandContext(request);
    const { id, code } = await params;
    const asset = await getOwnedAssetByShortCode(context, id, code);

    const poster = await renderPosterPng({
      payload: asset.qrPayload,
      headline: asset.campaign.name,
      venueName: asset.location?.venueName ?? "Approved location",
      shortCode: asset.shortCode,
    });

    return new Response(new Uint8Array(poster), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="stickerbomb-${asset.shortCode}.png"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
