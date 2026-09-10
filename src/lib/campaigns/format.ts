import type { CampaignStatusValue } from "@/lib/campaigns/types";

export const statusLabels: Record<CampaignStatusValue, string> = {
  DRAFT: "Draft",
  QUOTED: "Quoted",
  FUNDED: "Funded",
  ASSETS_READY: "Assets ready",
  DEPLOYING: "Deploying",
  VERIFYING: "Verifying",
  LIVE: "Live",
  EXPIRED: "Expired",
  REMOVING: "Removing",
  COMPLETE: "Complete",
  CANCELLED: "Cancelled",
  DISPUTED: "Disputed",
};

/** Shown wherever a draft has not yet supplied a value. */
export const notSetLabel = "Not set yet";

export function formatOptionalCampaignBudget(
  amount: string | null,
  currency: string,
) {
  return amount === null ? notSetLabel : formatCampaignBudget(amount, currency);
}

export function formatOptionalCampaignDate(
  value: string | null,
  includeTime = false,
) {
  return value === null ? notSetLabel : formatCampaignDate(value, includeTime);
}

export function formatOptionalPlacements(placementCount: number | null) {
  if (placementCount === null) return notSetLabel;
  return `${placementCount} ${placementCount === 1 ? "placement" : "placements"}`;
}

export function formatCampaignBudget(amount: string, currency: string) {
  const numeric = Number(amount);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency === "USDC" ? "USD" : currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numeric);

  return currency === "USDC" ? `${formatted} USDC` : formatted;
}

export function formatCampaignDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime
      ? { hour: "numeric", minute: "2-digit" }
      : {}),
  }).format(new Date(value));
}
