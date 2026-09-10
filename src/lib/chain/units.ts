import { formatUnits } from "viem";

/** Stablecoin decimals (USDC and the demo tUSDC both use 6). */
export const TOKEN_DECIMALS = 6;

/** One US cent is 10,000 base units of a 6-decimal stablecoin. */
const UNITS_PER_CENT = BigInt(10_000);

export function centsToTokenUnits(cents: bigint | number) {
  return BigInt(cents) * UNITS_PER_CENT;
}

export function tokenUnitsToCents(units: bigint) {
  return units / UNITS_PER_CENT;
}

export function formatTokenUnits(units: bigint) {
  return Number(formatUnits(units, TOKEN_DECIMALS)).toFixed(2);
}
