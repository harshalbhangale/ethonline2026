import { getAddress, isAddress, type Address } from "viem";
import { ApiError } from "@/lib/http/api-error";

export const SEPOLIA_CHAIN_ID = 11155111;

/** First block of the escrow deployment; event scans start here. */
const DEFAULT_DEPLOY_BLOCK = BigInt(11_677_029);

export type ChainConfig = {
  chainId: number;
  caip2: `eip155:${number}`;
  rpcUrl: string;
  usdc: Address;
  escrow: Address;
  /** True for the demo MockUSDC, which anyone can mint. */
  tokenMintable: boolean;
  deployBlock: bigint;
};

function readAddress(name: string): Address | null {
  const value = process.env[name]?.trim();
  return value && isAddress(value) ? getAddress(value) : null;
}

/** Whether escrow funding is configured. Without it, funding stays mocked. */
export function isOnchainConfigured() {
  return Boolean(
    readAddress("NEXT_PUBLIC_ESCROW_ADDRESS") &&
      readAddress("NEXT_PUBLIC_USDC_ADDRESS"),
  );
}

export function getChainConfig(): ChainConfig {
  const usdc = readAddress("NEXT_PUBLIC_USDC_ADDRESS");
  const escrow = readAddress("NEXT_PUBLIC_ESCROW_ADDRESS");

  if (!usdc || !escrow) {
    throw new ApiError(
      500,
      "CHAIN_NOT_CONFIGURED",
      "Escrow and stablecoin addresses are not configured.",
    );
  }

  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? SEPOLIA_CHAIN_ID);
  const deployBlock = process.env.ESCROW_DEPLOY_BLOCK?.trim();

  return {
    chainId,
    caip2: `eip155:${chainId}`,
    rpcUrl:
      process.env.SEPOLIA_RPC_URL?.trim() ||
      "https://ethereum-sepolia-rpc.publicnode.com",
    usdc,
    escrow,
    tokenMintable: process.env.NEXT_PUBLIC_USDC_MINTABLE !== "false",
    deployBlock: deployBlock ? BigInt(deployBlock) : DEFAULT_DEPLOY_BLOCK,
  };
}
