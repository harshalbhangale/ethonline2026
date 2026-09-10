import type { QuoteLineItemKindValue } from "@/lib/campaigns/pricing";

export type QuoteStatusValue = "DRAFT" | "APPROVED" | "SUPERSEDED";

export type QuoteLineItemDto = {
  kind: QuoteLineItemKindValue;
  label: string;
  amountMinor: string;
  amount: string;
  sortOrder: number;
};

export type CampaignQuoteDto = {
  id: string;
  campaignId: string;
  version: number;
  status: QuoteStatusValue;
  currency: string;

  lineItems: QuoteLineItemDto[];
  subtotalMinor: string;
  subtotal: string;
  totalMinor: string;
  total: string;

  /** The number of placements actually priced, which is what will be deployed. */
  pricedPlacementCount: number;
  /** What the brand asked for in the brief. */
  requestedPlacementCount: number | null;
  /** How many approved locations are currently assigned. */
  assignedLocationCount: number;

  budgetLimitMinor: string | null;
  budgetLimit: string | null;
  exceedsBudget: boolean;

  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CampaignQuoteResponse = {
  quote: CampaignQuoteDto;
};
