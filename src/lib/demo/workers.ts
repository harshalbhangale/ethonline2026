import { keccak256, toBytes } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { getPrivyClient } from "@/lib/auth/privy";
import type { WorkerContext } from "@/lib/auth/require-worker";
import { getPrismaClient } from "@/lib/database/prisma";

/**
 * Two prepared workers for rehearsing the brand flow before the Worker PWA
 * exists. Each gets its own Privy server wallet to receive escrow payouts.
 */
const demoWorkers = {
  installer: { privyUserId: "demo:installer", displayName: "Demo installer" },
  verifier: { privyUserId: "demo:verifier", displayName: "Demo verifier" },
} as const;

type DemoRole = keyof typeof demoWorkers;

export type DemoWorker = WorkerContext & { walletAddress: string };

async function createPayoutWallet(role: DemoRole) {
  try {
    const wallet = await getPrivyClient().wallets().create({
      chain_type: "ethereum",
      display_name: `StickerBomb demo ${role} payouts`,
      idempotency_key: `stickerbomb-demo-${role}-wallet`,
    });
    return wallet.address;
  } catch (error) {
    // Keep rehearsals working if Privy's wallet API is unavailable: derive a
    // stable address from the operator key instead. Logged so it is visible.
    console.warn(`Privy wallet creation failed for demo ${role}; using a derived address`, error);
    const operatorKey = process.env.PRIVATE_KEY?.trim() ?? "";
    return privateKeyToAddress(keccak256(toBytes(`stickerbomb-demo-${role}:${operatorKey}`)));
  }
}

async function ensureDemoWorker(role: DemoRole): Promise<DemoWorker> {
  const prisma = getPrismaClient();
  const { privyUserId, displayName } = demoWorkers[role];

  let user = await prisma.user.upsert({
    where: { privyUserId },
    update: {},
    create: { privyUserId },
  });

  await prisma.workerProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, displayName },
  });

  if (!user.walletAddress) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { walletAddress: await createPayoutWallet(role) },
    });
  }

  return {
    userId: user.id,
    privyUserId,
    displayName,
    walletAddress: user.walletAddress as string,
  };
}

export async function ensureDemoWorkers() {
  const installer = await ensureDemoWorker("installer");
  const verifier = await ensureDemoWorker("verifier");
  return { installer, verifier };
}
