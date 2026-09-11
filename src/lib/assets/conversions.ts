import { getPrismaClient } from "@/lib/database/prisma";

/** Fired by the StickerBomb snippet on page load, not by the brand. */
export const LANDING_EVENT = "landing";

const namePattern = /^[a-z0-9][a-z0-9_-]{0,59}$/;

export function normalizeEventName(name: string | undefined) {
  const candidate = (name ?? LANDING_EVENT).trim().toLowerCase();
  return namePattern.test(candidate) ? candidate : null;
}

export type ConversionOutcome = "recorded" | "duplicate" | "unknown-token";

/**
 * Records what a visitor did after scanning a poster.
 *
 * The click token is the id of the scan itself, so this cannot be used to
 * write against a campaign the caller does not already hold a token for. The
 * unique index on (scanEventId, name) makes a repeated report a no-op rather
 * than an inflated count, which matters because this is called from a page that
 * a visitor may reload.
 */
export async function recordConversion({
  clickToken,
  name,
  valueMinor,
  currency,
}: {
  clickToken: string;
  name: string;
  valueMinor?: bigint | null;
  currency?: string | null;
}): Promise<ConversionOutcome> {
  const prisma = getPrismaClient();

  const scan = await prisma.scanEvent.findUnique({
    where: { id: clickToken },
    select: { id: true, assetId: true, campaignId: true },
  });

  // An unknown token is not an error worth reporting back: a stale or copied
  // link is ordinary traffic, and saying so would confirm which tokens exist.
  if (!scan) return "unknown-token";

  try {
    await prisma.conversionEvent.create({
      data: {
        scanEventId: scan.id,
        assetId: scan.assetId,
        campaignId: scan.campaignId,
        name,
        valueMinor: valueMinor ?? null,
        currency: currency ?? null,
      },
    });
    return "recorded";
  } catch {
    // The unique index rejected it, so this scan already reported this event.
    return "duplicate";
  }
}
