import {
  OrganizationRole,
  type ChainTransaction,
  type Organization,
} from "@/generated/prisma/client";
import {
  encodeFunctionData,
  formatEther,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { getPrivyClient } from "@/lib/auth/privy";
import type { BrandContext } from "@/lib/auth/require-brand";
import { campaignEscrowAbi, erc20Abi } from "@/lib/chain/abis";
import { getPublicClient, waitForSuccess, withOperator } from "@/lib/chain/client";
import { getChainConfig, isOnchainConfigured } from "@/lib/chain/config";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/chain/explorer";
import {
  markChainTransaction,
  recordChainTransaction,
  type LedgerEntry,
} from "@/lib/chain/ledger";
import { formatTokenUnits } from "@/lib/chain/units";
import { formatMinorUnits } from "@/lib/campaigns/money";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import {
  buildTreasuryPolicyRules,
  describeTreasuryPolicy,
} from "@/lib/treasury/policy";
import type {
  ChainTransactionDto,
  FundingRequestDto,
  TreasuryDto,
} from "@/lib/treasury/types";

/** Below this, the operator tops the treasury up with Sepolia ETH for gas. */
const GAS_FLOOR_WEI = parseEther("0.004");
const GAS_TOP_UP_WEI = parseEther("0.015");
/** Demo top-up of the mintable test stablecoin: 500 tUSDC. */
const DEMO_TOP_UP_UNITS = BigInt(500_000_000);

export type Treasury = {
  organizationId: string;
  walletId: string;
  address: Address;
  policyId: string | null;
};

let cachedSymbol: string | undefined;

export async function readTokenSymbol() {
  if (cachedSymbol) return cachedSymbol;
  const config = getChainConfig();
  cachedSymbol = await getPublicClient().readContract({
    address: config.usdc,
    abi: erc20Abi,
    functionName: "symbol",
  });
  return cachedSymbol;
}

function privyFailure(error: unknown, action: string) {
  const status = (error as { status?: number }).status;
  const message = error instanceof Error ? error.message : String(error);

  if (status === 400 || status === 403 || /polic|denied|not allowed/i.test(message)) {
    return new ApiError(
      403,
      "TREASURY_POLICY_DENIED",
      `Privy refused to ${action}: ${message.slice(0, 240)}`,
    );
  }

  return new ApiError(
    502,
    "PRIVY_UNAVAILABLE",
    `Privy could not ${action} right now. Try again in a moment.`,
    { cause: message.slice(0, 240) },
  );
}

function toTreasury(organization: Organization): Treasury | null {
  if (!organization.treasuryWalletId || !organization.treasuryAddress) return null;
  return {
    organizationId: organization.id,
    walletId: organization.treasuryWalletId,
    address: organization.treasuryAddress as Address,
    policyId: organization.treasuryPolicyId,
  };
}

async function createTreasuryPolicy(organization: Organization) {
  const config = getChainConfig();
  const privy = getPrivyClient();
  const base = {
    chain_type: "ethereum" as const,
    version: "1.0" as const,
    name: `StickerBomb treasury · ${organization.name}`.slice(0, 50),
  };

  try {
    const policy = await privy.policies().create({
      ...base,
      rules: buildTreasuryPolicyRules(config.usdc, config.escrow, config.chainId),
      idempotency_key: `treasury-policy-${organization.id}`,
    });
    return policy.id;
  } catch (error) {
    // Fall back to address-only rules if calldata conditions are rejected.
    console.warn("Calldata policy rejected; creating address-only policy", error);
    try {
      const policy = await privy.policies().create({
        ...base,
        rules: buildTreasuryPolicyRules(config.usdc, config.escrow, config.chainId, false),
        idempotency_key: `treasury-policy-basic-${organization.id}`,
      });
      return policy.id;
    } catch (fallbackError) {
      throw privyFailure(fallbackError, "create the treasury policy");
    }
  }
}

/**
 * Returns the organization's Privy treasury wallet, creating it (with its
 * policy attached) on first use.
 */
export async function ensureOrganizationTreasury(organizationId: string): Promise<Treasury> {
  const prisma = getPrismaClient();
  let organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
  });

  const existing = toTreasury(organization);
  if (existing) return existing;

  if (!organization.treasuryPolicyId) {
    const policyId = await createTreasuryPolicy(organization);
    organization = await prisma.organization.update({
      where: { id: organizationId },
      data: { treasuryPolicyId: policyId },
    });
  }

  let wallet: { id: string; address: string };
  try {
    wallet = await getPrivyClient().wallets().create({
      chain_type: "ethereum",
      display_name: `${organization.name} treasury`.slice(0, 60),
      policy_ids: organization.treasuryPolicyId ? [organization.treasuryPolicyId] : [],
      idempotency_key: `treasury-wallet-${organization.id}`,
    });
  } catch (error) {
    throw privyFailure(error, "create the treasury wallet");
  }

  // A concurrent request may have attached a wallet first; keep that one.
  await prisma.organization.updateMany({
    where: { id: organizationId, treasuryWalletId: null },
    data: { treasuryWalletId: wallet.id, treasuryAddress: wallet.address },
  });

  const treasury = toTreasury(
    await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
  );
  if (!treasury) {
    throw new ApiError(500, "TREASURY_UNAVAILABLE", "The treasury wallet could not be saved.");
  }
  return treasury;
}

export async function readTreasuryBalances(address: Address) {
  const config = getChainConfig();
  const client = getPublicClient();
  const [tokenUnits, wei] = await Promise.all([
    client.readContract({
      address: config.usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    }),
    client.getBalance({ address }),
  ]);
  return { tokenUnits, wei };
}

async function confirm(hash: Hex) {
  try {
    const receipt = await waitForSuccess(hash);
    await markChainTransaction(hash, "CONFIRMED", receipt.blockNumber);
    return receipt;
  } catch (error) {
    await markChainTransaction(hash, "FAILED");
    throw error;
  }
}

/** Keeps a Privy wallet supplied with Sepolia ETH so it can pay its own gas. */
export async function ensureGas(address: Address, organizationId: string | null) {
  const wei = await getPublicClient().getBalance({ address });
  if (wei >= GAS_FLOOR_WEI) return;

  await withOperator(async (operator) => {
    const hash = await operator.sendTransaction({ to: address, value: GAS_TOP_UP_WEI });
    await recordChainTransaction({
      kind: "GAS_TOPUP",
      txHash: hash,
      organizationId,
      fromAddress: operator.account.address,
      toAddress: address,
      amount: GAS_TOP_UP_WEI,
    });
    await confirm(hash);
  });
}

/**
 * Sends a transaction signed by the organization's Privy wallet. Privy checks
 * it against the treasury policy before signing.
 */
export async function sendFromTreasury(
  treasury: Treasury,
  transaction: { to: Address; data: Hex },
  ledger: Omit<LedgerEntry, "txHash" | "fromAddress" | "toAddress" | "viaPrivy">,
) {
  const config = getChainConfig();
  await ensureGas(treasury.address, treasury.organizationId);

  let hash: Hex;
  try {
    const response = await getPrivyClient()
      .wallets()
      .ethereum()
      .sendTransaction(treasury.walletId, {
        caip2: config.caip2,
        params: {
          transaction: {
            to: transaction.to,
            data: transaction.data,
            chain_id: config.chainId,
          },
        },
      });
    hash = response.hash as Hex;
  } catch (error) {
    throw privyFailure(error, "sign this treasury transaction");
  }

  await recordChainTransaction({
    ...ledger,
    txHash: hash,
    fromAddress: treasury.address,
    toAddress: transaction.to,
    viaPrivy: true,
  });
  await confirm(hash);
  return hash;
}

/** Approves the escrow (if needed) and deposits a campaign budget. */
export async function depositCampaignBudget(
  treasury: Treasury,
  campaignId: string,
  escrowKey: Hex,
  amountUnits: bigint,
) {
  const config = getChainConfig();
  const allowance = await getPublicClient().readContract({
    address: config.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [treasury.address, config.escrow],
  });

  if (allowance < amountUnits) {
    await sendFromTreasury(
      treasury,
      {
        to: config.usdc,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [config.escrow, amountUnits],
        }),
      },
      {
        kind: "USDC_APPROVE",
        organizationId: treasury.organizationId,
        campaignId,
        amount: amountUnits,
      },
    );
  }

  return sendFromTreasury(
    treasury,
    {
      to: config.escrow,
      data: encodeFunctionData({
        abi: campaignEscrowAbi,
        functionName: "fundCampaign",
        args: [escrowKey, amountUnits],
      }),
    },
    {
      kind: "CAMPAIGN_FUND",
      organizationId: treasury.organizationId,
      campaignId,
      amount: amountUnits,
    },
  );
}

/** Testnet only: mints demo stablecoin into the treasury and tops up gas. */
export async function topUpTreasury(context: BrandContext) {
  const config = getChainConfig();
  if (!config.tokenMintable) {
    throw new ApiError(
      409,
      "TOP_UP_UNAVAILABLE",
      "This stablecoin cannot be minted. Send USDC to the treasury address instead.",
    );
  }

  const treasury = await ensureOrganizationTreasury(context.organizationId);

  await withOperator(async (operator) => {
    const hash = await operator.writeContract({
      address: config.usdc,
      abi: erc20Abi,
      functionName: "mint",
      args: [treasury.address, DEMO_TOP_UP_UNITS],
    });
    await recordChainTransaction({
      kind: "TREASURY_TOPUP",
      txHash: hash,
      organizationId: context.organizationId,
      fromAddress: operator.account.address,
      toAddress: treasury.address,
      amount: DEMO_TOP_UP_UNITS,
    });
    await confirm(hash);
  });

  await ensureGas(treasury.address, context.organizationId);
  return getTreasury(context);
}

export function toChainTransactionDto(
  transaction: ChainTransaction & { campaign?: { id: string; name: string } | null },
  symbol: string,
): ChainTransactionDto {
  let amount: string | null = null;
  if (transaction.amount) {
    amount =
      transaction.kind === "GAS_TOPUP"
        ? `${formatEther(BigInt(transaction.amount))} ETH`
        : `${formatTokenUnits(BigInt(transaction.amount))} ${symbol}`;
  }

  return {
    id: transaction.id,
    kind: transaction.kind,
    status: transaction.status,
    txHash: transaction.txHash,
    explorerUrl: explorerTxUrl(transaction.txHash),
    amount,
    viaPrivy: transaction.viaPrivy,
    campaign: transaction.campaign ?? null,
    placementId: transaction.placementId,
    createdAt: transaction.createdAt.toISOString(),
  };
}

export async function listFundingRequests(context: BrandContext): Promise<FundingRequestDto[]> {
  const requests = await getPrismaClient().fundingRequest.findMany({
    where: { organizationId: context.organizationId },
    include: { campaign: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return requests.map((request) => ({
    id: request.id,
    campaign: request.campaign,
    amountMinor: request.amountMinor.toString(),
    amount: formatMinorUnits(request.amountMinor),
    status: request.status,
    requestedByYou: request.requestedById === context.userId,
    canDecide: request.status === "PENDING" && request.requestedById !== context.userId,
    failureReason: request.failureReason,
    createdAt: request.createdAt.toISOString(),
  }));
}

export async function getTreasury(context: BrandContext): Promise<TreasuryDto> {
  const prisma = getPrismaClient();
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: context.organizationId },
  });
  const [otherApprovers, fundingRequests] = await Promise.all([
    prisma.organizationMember.count({
      where: {
        organizationId: context.organizationId,
        userId: { not: context.userId },
        role: { in: [OrganizationRole.BRAND, OrganizationRole.OPERATOR] },
      },
    }),
    listFundingRequests(context),
  ]);

  const base: TreasuryDto = {
    onchain: isOnchainConfigured(),
    wallet: null,
    walletError: null,
    policy: { id: organization.treasuryPolicyId, rules: [] },
    token: null,
    escrow: null,
    balances: null,
    approvalThreshold:
      organization.approvalThresholdMinor === null
        ? null
        : formatMinorUnits(organization.approvalThresholdMinor),
    approvalThresholdMinor: organization.approvalThresholdMinor?.toString() ?? null,
    otherApprovers,
    transactions: [],
    fundingRequests,
  };

  if (!base.onchain) return base;

  const config = getChainConfig();
  const symbol = await readTokenSymbol().catch(() => "USDC");
  base.token = { address: config.usdc, symbol, mintable: config.tokenMintable };
  base.escrow = { address: config.escrow, explorerUrl: explorerAddressUrl(config.escrow) };

  let treasury: Treasury | null = null;
  try {
    treasury = await ensureOrganizationTreasury(context.organizationId);
  } catch (error) {
    base.walletError =
      error instanceof ApiError ? error.message : "The treasury wallet is unavailable.";
  }

  const refreshed = await prisma.organization.findUniqueOrThrow({
    where: { id: context.organizationId },
  });
  base.policy = {
    id: refreshed.treasuryPolicyId,
    rules: refreshed.treasuryPolicyId ? describeTreasuryPolicy(symbol) : [],
  };

  if (treasury) {
    base.wallet = {
      address: treasury.address,
      explorerUrl: explorerAddressUrl(treasury.address),
      provider: "Privy server wallet",
    };
    const balances = await readTreasuryBalances(treasury.address);
    base.balances = {
      token: formatTokenUnits(balances.tokenUnits),
      tokenUnits: balances.tokenUnits.toString(),
      eth: Number(formatEther(balances.wei)).toFixed(4),
    };
  }

  const transactions = await prisma.chainTransaction.findMany({
    where: { organizationId: context.organizationId },
    include: { campaign: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  base.transactions = transactions.map((transaction) =>
    toChainTransactionDto(transaction, symbol),
  );

  return base;
}

export async function updateApprovalThreshold(
  context: BrandContext,
  thresholdMinor: bigint | null,
) {
  await getPrismaClient().organization.update({
    where: { id: context.organizationId },
    data: { approvalThresholdMinor: thresholdMinor },
  });
  return getTreasury(context);
}
