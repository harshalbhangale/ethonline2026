import {
  CampaignStatus,
  EvidenceStatus,
  JobRole,
  JobStatus,
  PlacementStatus,
  VerificationMode,
} from "@/generated/prisma/client";
import type { Hex } from "viem";
import type { BrandContext } from "@/lib/auth/require-brand";
import { perPlacementMinor } from "@/lib/campaigns/pricing";
import { campaignEscrowAbi } from "@/lib/chain/abis";
import { getPublicClient, waitForSuccess, withOperator } from "@/lib/chain/client";
import { getChainConfig, isOnchainConfigured } from "@/lib/chain/config";
import { explorerAddressUrl } from "@/lib/chain/explorer";
import { placementEscrowKey } from "@/lib/chain/keys";
import { markChainTransaction, recordChainTransaction } from "@/lib/chain/ledger";
import { centsToTokenUnits, formatTokenUnits } from "@/lib/chain/units";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";
import { readTokenSymbol, toChainTransactionDto } from "@/lib/treasury/service";
import type { ChainTransactionDto } from "@/lib/treasury/types";

/** Mirrors CampaignEscrow.PlacementStatus. */
const OnchainStatus = { None: 0, Registered: 1, Verified: 2, Removed: 3 } as const;

/**
 * Each campaign settles in the escrow it was funded into, which stays correct
 * after a new escrow version is deployed for later campaigns.
 */
function escrowFor(campaign: { escrowAddress: string | null }) {
  return (campaign.escrowAddress ?? getChainConfig().escrow) as Hex;
}

async function readOnchainPlacement(escrow: Hex, key: Hex) {
  const [, installer, verifier, , , , status] = await getPublicClient().readContract({
    address: escrow,
    abi: campaignEscrowAbi,
    functionName: "placements",
    args: [key],
  });
  return { installer, verifier, status: Number(status) };
}

async function confirmOperatorTx(hash: Hex) {
  try {
    const receipt = await waitForSuccess(hash);
    await markChainTransaction(hash, "CONFIRMED", receipt.blockNumber);
  } catch (error) {
    await markChainTransaction(hash, "FAILED");
    throw error;
  }
}

/**
 * Registers every placement of a funded campaign in its escrow, reserving the
 * installer, verifier and cleanup rewards. Idempotent: placements already
 * registered onchain are only linked.
 */
export async function registerCampaignPlacements(campaignId: string) {
  if (!isOnchainConfigured()) return;

  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { escrowCampaignId: true, escrowAddress: true, organizationId: true },
  });
  if (!campaign?.escrowCampaignId) return;

  const escrow = escrowFor(campaign);
  const placements = await prisma.placement.findMany({
    where: { campaignId, onchainPlacementId: null },
    include: { jobs: { where: { role: JobRole.INSTALLER }, select: { rewardMinor: true } } },
    orderBy: { createdAt: "asc" },
  });

  for (const placement of placements) {
    const key = placementEscrowKey(placement.id);
    const onchain = await readOnchainPlacement(escrow, key);

    if (onchain.status === OnchainStatus.None) {
      const installerMinor =
        placement.jobs[0]?.rewardMinor ?? BigInt(perPlacementMinor.installation);

      await withOperator(async (operator) => {
        const hash = await operator.writeContract({
          address: escrow,
          abi: campaignEscrowAbi,
          functionName: "registerPlacement",
          args: [
            key,
            campaign.escrowCampaignId as Hex,
            centsToTokenUnits(installerMinor),
            centsToTokenUnits(perPlacementMinor.verification),
            centsToTokenUnits(perPlacementMinor.cleanupReserve),
          ],
        });
        await recordChainTransaction({
          kind: "PLACEMENT_REGISTER",
          txHash: hash,
          organizationId: campaign.organizationId,
          campaignId,
          placementId: placement.id,
          fromAddress: operator.account.address,
          toAddress: escrow,
          amount: centsToTokenUnits(
            installerMinor +
              BigInt(perPlacementMinor.verification + perPlacementMinor.cleanupReserve),
          ),
        });
        await confirmOperatorTx(hash);
      });
    }

    await prisma.placement.update({
      where: { id: placement.id },
      data: { onchainPlacementId: key },
    });
  }
}

const assignInclude = {
  campaign: { select: { organizationId: true, escrowAddress: true } },
  installer: { select: { walletAddress: true } },
  verifier: { select: { walletAddress: true } },
} as const;

/**
 * Records the payout wallets onchain. A self-verified placement names its
 * installer in both roles, so they receive both rewards; a spot-checked one
 * names the independent checker as verifier.
 */
export async function assignPlacementWorkers(placementId: string) {
  if (!isOnchainConfigured()) return;

  const prisma = getPrismaClient();
  let placement = await prisma.placement.findUniqueOrThrow({
    where: { id: placementId },
    include: assignInclude,
  });

  if (!placement.onchainPlacementId) {
    await registerCampaignPlacements(placement.campaignId);
    placement = await prisma.placement.findUniqueOrThrow({
      where: { id: placementId },
      include: assignInclude,
    });
  }

  const installer = placement.installer?.walletAddress;
  const verifier =
    placement.verificationMode === VerificationMode.SELF
      ? installer
      : placement.verifier?.walletAddress;
  if (!placement.onchainPlacementId || !installer || !verifier) {
    throw new ApiError(
      409,
      "WORKER_WALLET_MISSING",
      "Every worker on this placement needs a payout wallet before settlement.",
    );
  }

  const escrow = escrowFor(placement.campaign);
  const key = placement.onchainPlacementId as Hex;
  const onchain = await readOnchainPlacement(escrow, key);
  if (
    onchain.installer.toLowerCase() === installer.toLowerCase() &&
    onchain.verifier.toLowerCase() === verifier.toLowerCase()
  ) {
    return;
  }

  await withOperator(async (operator) => {
    const hash = await operator.writeContract({
      address: escrow,
      abi: campaignEscrowAbi,
      functionName: "assignWorkers",
      args: [key, installer as Hex, verifier as Hex],
    });
    await recordChainTransaction({
      kind: "WORKERS_ASSIGN",
      txHash: hash,
      organizationId: placement.campaign.organizationId,
      campaignId: placement.campaignId,
      placementId,
      fromAddress: operator.account.address,
      toAddress: escrow,
    });
    await confirmOperatorTx(hash);
  });
}

async function refreshCampaignStatus(campaignId: string) {
  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });
  const advanceable: CampaignStatus[] = [
    CampaignStatus.ASSETS_READY,
    CampaignStatus.DEPLOYING,
    CampaignStatus.VERIFYING,
  ];
  if (!campaign || !advanceable.includes(campaign.status)) return;

  const placements = await prisma.placement.findMany({
    where: { campaignId, status: { not: PlacementStatus.CANCELLED } },
    select: { status: true },
  });
  const verified = placements.filter((p) => p.status === PlacementStatus.VERIFIED).length;

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status:
        verified > 0 && verified === placements.length
          ? CampaignStatus.LIVE
          : CampaignStatus.VERIFYING,
    },
  });
}

/**
 * Reads a placement's settlement from its escrow and mirrors it in the
 * database: the placement becomes VERIFIED and its jobs PAID. Contract state
 * is the source of truth; this only ever follows it.
 */
export async function syncPlacementFromChain(placementId: string) {
  if (!isOnchainConfigured()) return;

  const prisma = getPrismaClient();
  const placement = await prisma.placement.findUnique({
    where: { id: placementId },
    include: {
      campaign: { select: { organizationId: true, escrowAddress: true } },
      jobs: true,
    },
  });
  if (!placement?.onchainPlacementId) return;

  const settled: PlacementStatus[] = [
    PlacementStatus.VERIFIED,
    PlacementStatus.REMOVING,
    PlacementStatus.REMOVED,
  ];
  if (settled.includes(placement.status)) return;

  const escrow = escrowFor(placement.campaign);
  const key = placement.onchainPlacementId as Hex;
  const onchain = await readOnchainPlacement(escrow, key);
  if (onchain.status < OnchainStatus.Verified) return;

  const logs = await getPublicClient().getContractEvents({
    address: escrow,
    abi: campaignEscrowAbi,
    eventName: "PlacementVerified",
    args: { placementId: key },
    fromBlock: getChainConfig().deployBlock,
  });
  const log = logs.at(-1);

  if (log?.transactionHash) {
    await recordChainTransaction({
      kind: "PLACEMENT_VERIFIED",
      txHash: log.transactionHash,
      logIndex: log.logIndex ?? -1,
      status: "CONFIRMED",
      organizationId: placement.campaign.organizationId,
      campaignId: placement.campaignId,
      placementId,
      fromAddress: escrow,
      amount: (log.args.installerPaid ?? BigInt(0)) + (log.args.verifierPaid ?? BigInt(0)),
      blockNumber: log.blockNumber,
    });
  }

  const now = new Date();
  const paidJobs = placement.jobs.filter(
    (job) =>
      (job.role === JobRole.INSTALLER || job.role === JobRole.VERIFIER) &&
      job.workerUserId &&
      job.status !== JobStatus.PAID,
  );

  await prisma.$transaction(async (transaction) => {
    await transaction.placement.update({
      where: { id: placementId },
      data: { status: PlacementStatus.VERIFIED, verifiedAt: now },
    });
    for (const job of paidJobs) {
      await transaction.job.update({
        where: { id: job.id },
        data: { status: JobStatus.PAID, resolvedAt: job.resolvedAt ?? now, paidAt: now },
      });
    }
    await transaction.evidence.updateMany({
      where: { placementId, status: EvidenceStatus.SUBMITTED },
      data: { status: EvidenceStatus.ACCEPTED },
    });
    const workerIds = [...new Set(paidJobs.flatMap((job) => (job.workerUserId ? [job.workerUserId] : [])))];
    await transaction.workerProfile.updateMany({
      where: { userId: { in: workerIds } },
      data: { completedJobs: { increment: 1 } },
    });
  });

  await refreshCampaignStatus(placement.campaignId);
}

export type CampaignEscrowDto = {
  onchain: boolean;
  escrowAddress: string | null;
  escrowExplorerUrl: string | null;
  campaignKey: string | null;
  fundingTxHash: string | null;
  symbol: string;
  /** Formatted token amounts, read live from the contract. */
  funded: string | null;
  committed: string | null;
  paidOut: string | null;
  held: string | null;
  available: string | null;
  cleanupReserveLocked: string | null;
  transactions: ChainTransactionDto[];
};

async function loadOwnedCampaign(context: BrandContext, campaignId: string) {
  const campaign = await getPrismaClient().campaign.findFirst({
    where: { id: campaignId, organizationId: context.organizationId },
  });
  if (!campaign) {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
  }
  return campaign;
}

export async function getCampaignEscrow(
  context: BrandContext,
  campaignId: string,
): Promise<CampaignEscrowDto> {
  const campaign = await loadOwnedCampaign(context, campaignId);
  const prisma = getPrismaClient();
  const onchain = isOnchainConfigured();
  const symbol = onchain ? await readTokenSymbol().catch(() => "USDC") : "USD";

  const transactions = await prisma.chainTransaction.findMany({
    where: { campaignId },
    include: { campaign: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const dto: CampaignEscrowDto = {
    onchain,
    escrowAddress: campaign.escrowAddress,
    escrowExplorerUrl: campaign.escrowAddress ? explorerAddressUrl(campaign.escrowAddress) : null,
    campaignKey: campaign.escrowCampaignId,
    fundingTxHash: campaign.escrowCampaignId ? campaign.fundingReference : null,
    symbol,
    funded: null,
    committed: null,
    paidOut: null,
    held: null,
    available: null,
    cleanupReserveLocked: null,
    transactions: transactions.map((transaction) => toChainTransactionDto(transaction, symbol)),
  };

  if (!onchain || !campaign.escrowCampaignId || !campaign.escrowAddress) return dto;

  const client = getPublicClient();
  const key = campaign.escrowCampaignId as Hex;
  const address = campaign.escrowAddress as Hex;
  const [[, funded, committed, paidOut], held, available] = await Promise.all([
    client.readContract({ address, abi: campaignEscrowAbi, functionName: "campaigns", args: [key] }),
    client.readContract({ address, abi: campaignEscrowAbi, functionName: "heldBalance", args: [key] }),
    client.readContract({ address, abi: campaignEscrowAbi, functionName: "availableBudget", args: [key] }),
  ]);

  const verifiedCount = await prisma.placement.count({
    where: { campaignId, status: PlacementStatus.VERIFIED },
  });

  dto.funded = formatTokenUnits(funded);
  dto.committed = formatTokenUnits(committed);
  dto.paidOut = formatTokenUnits(paidOut);
  dto.held = formatTokenUnits(held);
  dto.available = formatTokenUnits(available);
  dto.cleanupReserveLocked = formatTokenUnits(
    centsToTokenUnits(BigInt(perPlacementMinor.cleanupReserve * verifiedCount)),
  );
  return dto;
}

/** Re-runs registration and settlement sync for a campaign. Safe to repeat. */
export async function syncCampaignOnchain(context: BrandContext, campaignId: string) {
  await loadOwnedCampaign(context, campaignId);
  await registerCampaignPlacements(campaignId);

  const placements = await getPrismaClient().placement.findMany({
    where: { campaignId },
    select: { id: true },
  });
  for (const placement of placements) {
    await syncPlacementFromChain(placement.id);
  }

  return getCampaignEscrow(context, campaignId);
}
