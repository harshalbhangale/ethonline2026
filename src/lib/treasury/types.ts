export type ChainTransactionKindValue =
  | "TREASURY_TOPUP"
  | "GAS_TOPUP"
  | "USDC_APPROVE"
  | "CAMPAIGN_FUND"
  | "PLACEMENT_REGISTER"
  | "WORKERS_ASSIGN"
  | "PLACEMENT_VERIFIED"
  | "PLACEMENT_REJECTED"
  | "CLEANUP_RELEASE"
  | "CAMPAIGN_REFUND";

export type ChainTransactionDto = {
  id: string;
  kind: ChainTransactionKindValue;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  txHash: string;
  explorerUrl: string;
  /** Formatted amount with unit, e.g. "60.00 tUSDC" or "0.015 ETH". */
  amount: string | null;
  viaPrivy: boolean;
  campaign: { id: string; name: string } | null;
  placementId: string | null;
  createdAt: string;
};

export type FundingRequestStatusValue =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTED"
  | "FAILED";

export type FundingRequestDto = {
  id: string;
  campaign: { id: string; name: string };
  amountMinor: string;
  amount: string;
  status: FundingRequestStatusValue;
  requestedByYou: boolean;
  /** True when the viewer is a different member and the request is pending. */
  canDecide: boolean;
  failureReason: string | null;
  createdAt: string;
};

export type TreasuryDto = {
  onchain: boolean;
  wallet: {
    address: string;
    explorerUrl: string;
    provider: "Privy server wallet";
  } | null;
  /** Set when the Privy wallet could not be created or read. */
  walletError: string | null;
  policy: { id: string | null; rules: string[] };
  token: { address: string; symbol: string; mintable: boolean } | null;
  escrow: { address: string; explorerUrl: string } | null;
  balances: { token: string; tokenUnits: string; eth: string } | null;
  approvalThreshold: string | null;
  approvalThresholdMinor: string | null;
  otherApprovers: number;
  transactions: ChainTransactionDto[];
  fundingRequests: FundingRequestDto[];
};

export type TreasuryResponse = { treasury: TreasuryDto };
