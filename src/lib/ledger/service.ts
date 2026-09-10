import { LedgerEntryKind, type Prisma } from "@/generated/prisma/client";

/**
 * Campaign escrow, kept as an append-only ledger.
 *
 * Balances are never stored as a column. Every figure shown to a brand or a
 * worker is the sum of entries, so a payout that ran twice would be visible
 * rather than silently absorbed. `@@unique([jobId, kind])` in the schema makes
 * the double-write fail outright.
 *
 * Sign convention, from the campaign's point of view:
 *   CAMPAIGN_FUNDING   positive  money the brand put in
 *   PLACEMENT_HOLD     negative  reserved for one job, not yet earned
 *   HOLD_RELEASE       positive  reservation returned after a rejection
 *   INSTALLER_PAYOUT   negative  earned by the installer
 *   VERIFIER_PAYOUT    negative  earned by the verifier
 *   REFUND             negative  returned to the brand
 *
 * A worker's balance is the sum of the payout entries carrying their id, which
 * are negative for the campaign and therefore negated when read per worker.
 */

type LedgerDatabase = Pick<Prisma.TransactionClient, "ledgerEntry">;

export type RecordEntryInput = {
  kind: LedgerEntryKind;
  amountMinor: bigint;
  campaignId?: string;
  jobId?: string;
  workerId?: string;
  currency?: string;
  memo?: string;
};

export async function recordEntry(
  database: LedgerDatabase,
  input: RecordEntryInput,
) {
  return database.ledgerEntry.create({
    data: {
      kind: input.kind,
      amountMinor: input.amountMinor,
      campaignId: input.campaignId ?? null,
      jobId: input.jobId ?? null,
      workerId: input.workerId ?? null,
      currency: input.currency ?? "USD",
      memo: input.memo ?? null,
    },
  });
}

/** Total a worker has been credited, in minor units. */
export async function workerEarnedMinor(
  database: LedgerDatabase,
  workerId: string,
): Promise<bigint> {
  const result = await database.ledgerEntry.aggregate({
    where: {
      workerId,
      kind: {
        in: [LedgerEntryKind.INSTALLER_PAYOUT, LedgerEntryKind.VERIFIER_PAYOUT],
      },
    },
    _sum: { amountMinor: true },
  });

  // Payouts are negative against the campaign; a worker reads them as income.
  const sum = result._sum.amountMinor ?? BigInt(0);
  return sum < BigInt(0) ? -sum : sum;
}

/** What remains in a campaign's escrow: funding minus everything committed. */
export async function campaignBalanceMinor(
  database: LedgerDatabase,
  campaignId: string,
): Promise<bigint> {
  const result = await database.ledgerEntry.aggregate({
    where: { campaignId },
    _sum: { amountMinor: true },
  });

  return result._sum.amountMinor ?? BigInt(0);
}
