import { CampaignAssetStatus } from "@/generated/prisma/client";
import { CLICK_TOKEN_PARAM, deriveScanSignals } from "@/lib/assets/scan";
import { getPrismaClient } from "@/lib/database/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ code: string }>;
};

/**
 * Hands the destination a token identifying this scan, so the brand's own site
 * can report back what the visitor went on to do. Without it a conversion
 * could never be traced to the poster that caused it.
 */
function withClickToken(destination: string, scanId: string | null) {
  if (!scanId) return destination;

  try {
    const url = new URL(destination);
    url.searchParams.set(CLICK_TOKEN_PARAM, scanId);
    return url.toString();
  } catch {
    // A destination we cannot parse still has to redirect.
    return destination;
  }
}

/**
 * Public QR redirect.
 *
 * This route is on the critical path for a stranger standing in front of a
 * poster, so it stays deliberately thin: resolve the code, redirect, and record
 * attribution without ever blocking the redirect on it. It performs no
 * authentication, no blockchain work and no aggregation.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const { code } = await params;

  try {
    const prisma = getPrismaClient();
    const asset = await prisma.campaignAsset.findUnique({
      where: { shortCode: code },
      select: {
        id: true,
        campaignId: true,
        status: true,
        destinationUrl: true,
        campaign: { select: { destinationUrl: true } },
      },
    });

    if (!asset || asset.status === CampaignAssetStatus.DISABLED) {
      return new Response(null, { status: 404 });
    }

    // The campaign's current destination wins, so a brand can repoint printed
    // posters without reprinting them.
    const destination = asset.campaign.destinationUrl ?? asset.destinationUrl;
    const signals = deriveScanSignals(request);

    // Attribution must never delay or break the redirect.
    let scanId: string | null = null;
    try {
      const scan = await prisma.scanEvent.create({
        data: {
          assetId: asset.id,
          campaignId: asset.campaignId,
          referrer: signals.referrer,
          userAgentHash: signals.userAgentHash,
          sessionHash: signals.sessionHash,
          coarseRegion: signals.coarseRegion,
          isSuspectedBot: signals.isSuspectedBot,
        },
        select: { id: true },
      });
      scanId = scan.id;
    } catch (error) {
      console.error("Scan attribution failed", error);
    }

    return Response.redirect(withClickToken(destination, scanId), 302);
  } catch (error) {
    console.error("Scan redirect failed", error);
    return new Response(null, { status: 404 });
  }
}
