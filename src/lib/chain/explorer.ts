/** Browser-safe Etherscan helpers for Sepolia. */
const explorerBase = "https://sepolia.etherscan.io";

export function explorerTxUrl(hash: string) {
  return `${explorerBase}/tx/${hash}`;
}

export function explorerAddressUrl(address: string) {
  return `${explorerBase}/address/${address}`;
}

export function shortHex(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}
