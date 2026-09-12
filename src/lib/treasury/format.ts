import type { ChainTransactionKindValue } from "@/lib/treasury/types";

export const transactionKindLabels: Record<ChainTransactionKindValue, string> = {
  TREASURY_TOPUP: "Test funds added",
  GAS_TOPUP: "Gas top-up",
  USDC_APPROVE: "Escrow allowance",
  CAMPAIGN_FUND: "Campaign funded",
  PLACEMENT_REGISTER: "Rewards reserved",
  WORKERS_ASSIGN: "Workers recorded",
  PLACEMENT_VERIFIED: "Workers paid",
  PLACEMENT_REJECTED: "Proof rejected",
  CLEANUP_RELEASE: "Cleanup paid",
  CAMPAIGN_REFUND: "Refund",
  WORKER_PAYOUT_SWEEP: "Swept to primary wallet",
};

export function transactionKindLabel(kind: string) {
  return transactionKindLabels[kind as ChainTransactionKindValue] ?? kind;
}
