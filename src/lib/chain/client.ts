import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig, SEPOLIA_CHAIN_ID } from "@/lib/chain/config";
import { ApiError } from "@/lib/http/api-error";

// Defined here rather than imported from "viem/chains": that index bundles
// every chain, including one whose dynamic import webpack cannot analyse.
const sepolia = defineChain({
  id: SEPOLIA_CHAIN_ID,
  name: "Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://ethereum-sepolia-rpc.publicnode.com"] },
  },
  blockExplorers: {
    default: { name: "Etherscan", url: "https://sepolia.etherscan.io" },
  },
  testnet: true,
});

function createSepoliaPublicClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(getChainConfig().rpcUrl, { retryCount: 3, timeout: 20_000 }),
  });
}

function createOperatorClient() {
  const raw = process.env.PRIVATE_KEY?.trim();

  if (!raw) {
    throw new ApiError(
      500,
      "OPERATOR_NOT_CONFIGURED",
      "The escrow operator key is not configured.",
    );
  }

  const account = privateKeyToAccount(
    (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`,
  );

  return createWalletClient({
    account,
    chain: sepolia,
    transport: http(getChainConfig().rpcUrl, { retryCount: 3, timeout: 20_000 }),
  });
}

export type SepoliaPublicClient = ReturnType<typeof createSepoliaPublicClient>;
export type OperatorClient = ReturnType<typeof createOperatorClient>;

let publicClient: SepoliaPublicClient | undefined;
let operatorClient: OperatorClient | undefined;

export function getPublicClient() {
  publicClient ??= createSepoliaPublicClient();
  return publicClient;
}

export function getOperatorClient() {
  operatorClient ??= createOperatorClient();
  return operatorClient;
}

let operatorQueue: Promise<unknown> = Promise.resolve();

/**
 * Serialises operator transactions so concurrent requests never race for the
 * same nonce.
 */
export function withOperator<T>(
  task: (client: OperatorClient) => Promise<T>,
): Promise<T> {
  const run = operatorQueue.then(() => task(getOperatorClient()));
  operatorQueue = run.catch(() => undefined);
  return run;
}

export async function waitForSuccess(hash: Hash) {
  const receipt = await getPublicClient().waitForTransactionReceipt({
    hash,
    timeout: 180_000,
    pollingInterval: 2_000,
  });

  if (receipt.status !== "success") {
    throw new ApiError(
      502,
      "TRANSACTION_REVERTED",
      `Transaction ${hash} reverted on Sepolia.`,
    );
  }

  return receipt;
}
