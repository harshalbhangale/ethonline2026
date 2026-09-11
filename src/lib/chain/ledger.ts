import type {
  ChainTransactionKind,
  ChainTransactionStatus,
} from "@/generated/prisma/client";
import { getChainConfig } from "@/lib/chain/config";
import { getPrismaClient } from "@/lib/database/prisma";

export type LedgerEntry = {
  kind: ChainTransactionKind;
  txHash: string;
  logIndex?: number;
  status?: ChainTransactionStatus;
  organizationId?: string | null;
  campaignId?: string | null;
  placementId?: string | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  amount?: bigint | null;
  viaPrivy?: boolean;
  blockNumber?: bigint | null;
};

/**
 * Records a transaction in the human-readable history. Idempotent per
 * (hash, log index, kind), so event syncs and retries never duplicate rows.
 */
export async function recordChainTransaction(entry: LedgerEntry) {
  const logIndex = entry.logIndex ?? -1;
  const data = {
    status: entry.status ?? "PENDING",
    organizationId: entry.organizationId ?? null,
    campaignId: entry.campaignId ?? null,
    placementId: entry.placementId ?? null,
    fromAddress: entry.fromAddress?.toLowerCase() ?? null,
    toAddress: entry.toAddress?.toLowerCase() ?? null,
    amount: entry.amount?.toString() ?? null,
    viaPrivy: entry.viaPrivy ?? false,
    blockNumber: entry.blockNumber ?? null,
  };

  return getPrismaClient().chainTransaction.upsert({
    where: {
      txHash_logIndex_kind: {
        txHash: entry.txHash,
        logIndex,
        kind: entry.kind,
      },
    },
    update: { status: data.status, blockNumber: data.blockNumber },
    create: {
      ...data,
      kind: entry.kind,
      txHash: entry.txHash,
      logIndex,
      chainId: getChainConfig().chainId,
    },
  });
}

export async function markChainTransaction(
  txHash: string,
  status: ChainTransactionStatus,
  blockNumber?: bigint,
) {
  await getPrismaClient().chainTransaction.updateMany({
    where: { txHash },
    data: { status, ...(blockNumber !== undefined ? { blockNumber } : {}) },
  });
}
