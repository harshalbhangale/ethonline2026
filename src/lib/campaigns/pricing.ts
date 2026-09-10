/**
 * Deterministic campaign pricing.
 *
 * Every amount is in integer minor units. There is no model or randomness here:
 * the same inputs must always produce the same quote, because an approved quote
 * becomes immutable once a campaign is funded.
 *
 * These rates back both the live estimate shown while choosing an area and the
 * real quote, so the two can never disagree.
 */
export const rateCardVersion = 1;

export const perPlacementMinor = {
  printing: 300,
  installation: 600,
  verification: 400,
  cleanupReserve: 200,
} as const;

export const platformFeeBaseMinor = 1_000;

/** Applied to the subtotal, then rounded to the nearest whole currency unit. */
export const contingencyPercent = 9;

export type QuoteLineItemKindValue =
  | "PRINTING"
  | "INSTALLATION"
  | "VERIFICATION"
  | "CLEANUP_RESERVE"
  | "PLATFORM_FEE"
  | "CONTINGENCY";

export type QuoteLine = {
  kind: QuoteLineItemKindValue;
  label: string;
  amountMinor: number;
  sortOrder: number;
};

export type ComputedQuote = {
  lines: QuoteLine[];
  subtotalMinor: number;
  totalMinor: number;
};

function roundToWholeUnit(minor: number) {
  return Math.round(minor / 100) * 100;
}

/**
 * Costs that scale with each physical placement.
 *
 * Shown as "estimated local fulfilment" before the full quote exists. It
 * deliberately excludes the platform fee and contingency, which are not local
 * costs.
 */
export function estimateLocalFulfilmentMinor(placementCount: number) {
  return (
    placementCount *
    (perPlacementMinor.printing +
      perPlacementMinor.installation +
      perPlacementMinor.verification)
  );
}

/** Rough field time: one trip plus per-placement handling. */
export function estimateDeploymentMinutes(placementCount: number) {
  return 15 + placementCount * 5;
}

export function computeQuote(placementCount: number): ComputedQuote {
  const lines: QuoteLine[] = [
    {
      kind: "PRINTING",
      label: "Printing",
      amountMinor: placementCount * perPlacementMinor.printing,
      sortOrder: 1,
    },
    {
      kind: "INSTALLATION",
      label: "Installation",
      amountMinor: placementCount * perPlacementMinor.installation,
      sortOrder: 2,
    },
    {
      kind: "VERIFICATION",
      label: "Verification",
      amountMinor: placementCount * perPlacementMinor.verification,
      sortOrder: 3,
    },
    {
      kind: "CLEANUP_RESERVE",
      label: "Cleanup reserve",
      amountMinor: placementCount * perPlacementMinor.cleanupReserve,
      sortOrder: 4,
    },
    {
      kind: "PLATFORM_FEE",
      label: "Platform fee",
      amountMinor: platformFeeBaseMinor,
      sortOrder: 5,
    },
  ];

  const subtotalMinor = lines.reduce((total, line) => total + line.amountMinor, 0);
  const contingencyMinor = roundToWholeUnit(
    (subtotalMinor * contingencyPercent) / 100,
  );

  lines.push({
    kind: "CONTINGENCY",
    label: "Contingency",
    amountMinor: contingencyMinor,
    sortOrder: 6,
  });

  return {
    lines,
    subtotalMinor,
    totalMinor: subtotalMinor + contingencyMinor,
  };
}
