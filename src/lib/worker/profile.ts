import { isAddress, getAddress } from "viem";
import type { WorkerContext } from "@/lib/auth/require-worker";
import { getPrismaClient } from "@/lib/database/prisma";
import { ApiError } from "@/lib/http/api-error";

export type WorkerProfileDto = {
  displayName: string;
  payoutAddress: string | null;
  primaryWalletAddress: string | null;
};

export async function getWorkerProfileSettings(context: WorkerContext): Promise<WorkerProfileDto> {
  const user = await getPrismaClient().user.findUniqueOrThrow({
    where: { id: context.userId },
    select: { walletAddress: true, primaryWalletAddress: true },
  });

  return {
    displayName: context.displayName,
    payoutAddress: user.walletAddress,
    primaryWalletAddress: user.primaryWalletAddress,
  };
}

/**
 * A worker's own withdrawal address. Every 24 hours, whatever their payout
 * wallet has accumulated is swept here automatically — see
 * `src/lib/payouts/sweep.ts`. Passing `null` turns the daily sweep off again.
 */
export async function setPrimaryWallet(
  context: WorkerContext,
  address: string | null,
): Promise<WorkerProfileDto> {
  if (address !== null) {
    if (!isAddress(address)) {
      throw new ApiError(400, "INVALID_ADDRESS", "That doesn't look like a wallet address.");
    }
    address = getAddress(address);
  }

  await getPrismaClient().user.update({
    where: { id: context.userId },
    data: { primaryWalletAddress: address },
  });

  return getWorkerProfileSettings(context);
}
