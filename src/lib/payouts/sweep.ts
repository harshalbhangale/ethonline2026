import { encodeFunctionData, type Address, type Hex } from "viem";
import { getPrivyClient } from "@/lib/auth/privy";
import { erc20Abi } from "@/lib/chain/abis";
import { getPublicClient, waitForSuccess } from "@/lib/chain/client";
import { getChainConfig } from "@/lib/chain/config";
import { markChainTransaction, recordChainTransaction } from "@/lib/chain/ledger";
import { formatTokenUnits } from "@/lib/chain/units";
import { getPrismaClient } from "@/lib/database/prisma";
import { ensureGas } from "@/lib/treasury/service";

export type SweepResult = {
  checked: number;
  swept: { userId: string; from: Address; to: Address; amountUnits: string; txHash: string }[];
  skipped: { userId: string; reason: string }[];
};

/**
 * Daily payout sweep: every worker who has set a primary wallet gets their
 * payout wallet's whole balance sent there. Run once a day (07:00 UTC) by
 * `/api/cron/sweep-payouts` — see vercel.json.
 */
export async function sweepWorkerPayouts(): Promise<SweepResult> {
  const prisma = getPrismaClient();
  const config = getChainConfig();
  const publicClient = getPublicClient();

  const workers = await prisma.user.findMany({
    where: {
      primaryWalletAddress: { not: null },
      walletAddress: { not: null },
      payoutWalletId: { not: null },
    },
    select: { id: true, walletAddress: true, payoutWalletId: true, primaryWalletAddress: true },
  });

  const result: SweepResult = { checked: workers.length, swept: [], skipped: [] };

  for (const worker of workers) {
    const from = worker.walletAddress as Address;
    const to = worker.primaryWalletAddress as Address;
    const walletId = worker.payoutWalletId as string;

    try {
      const balance = await publicClient.readContract({
        address: config.usdc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [from],
      });

      if (balance <= 0n) {
        result.skipped.push({ userId: worker.id, reason: "Nothing to sweep." });
        continue;
      }

      // The payout wallet pays its own gas, so it needs a little native token first.
      await ensureGas(from, null);

      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [to, balance],
      });

      const response = await getPrivyClient().wallets().ethereum().sendTransaction(walletId, {
        caip2: config.caip2,
        params: {
          transaction: { to: config.usdc, data, chain_id: config.chainId },
        },
      });
      const hash = response.hash as Hex;

      await recordChainTransaction({
        kind: "WORKER_PAYOUT_SWEEP",
        txHash: hash,
        fromAddress: from,
        toAddress: to,
        amount: balance,
        viaPrivy: true,
      });

      try {
        const receipt = await waitForSuccess(hash);
        await markChainTransaction(hash, "CONFIRMED", receipt.blockNumber);
      } catch {
        await markChainTransaction(hash, "FAILED");
        throw new Error("Sweep transaction reverted or timed out.");
      }

      result.swept.push({
        userId: worker.id,
        from,
        to,
        amountUnits: formatTokenUnits(balance),
        txHash: hash,
      });
    } catch (error) {
      result.skipped.push({
        userId: worker.id,
        reason: error instanceof Error ? error.message : "Sweep failed.",
      });
    }
  }

  return result;
}
