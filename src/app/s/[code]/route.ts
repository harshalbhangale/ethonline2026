import { CampaignAssetStatus } from "@/generated/prisma/client";
import { deriveScanSignals } from "@/lib/assets/scan";
import { getPrismaClient } from "@/lib/database/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ code: string }>;
};

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
    try {
      await prisma.scanEvent.create({
        data: {
          assetId: asset.id,
          campaignId: asset.campaignId,
          referrer: signals.referrer,
          userAgentHash: signals.userAgentHash,
          sessionHash: signals.sessionHash,
          coarseRegion: signals.coarseRegion,
          isSuspectedBot: signals.isSuspectedBot,
        },
      });
    } catch (error) {
      console.error("Scan attribution failed", error);
    }

    return Response.redirect(destination, 302);
  } catch (error) {
    console.error("Scan redirect failed", error);
    return new Response(null, { status: 404 });
  }
}
