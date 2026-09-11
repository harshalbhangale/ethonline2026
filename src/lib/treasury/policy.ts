import type { PrivyClient } from "@privy-io/node";
import type { Address } from "viem";

type PolicyRules = Parameters<ReturnType<PrivyClient["policies"]>["create"]>[0]["rules"];

/** Largest single escrow deposit the treasury may make: 10,000 tokens. */
export const MAX_FUNDING_UNITS = BigInt(10_000_000_000);

const approveFragment = {
  type: "function",
  name: "approve",
  stateMutability: "nonpayable",
  inputs: [
    { name: "spender", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  outputs: [{ name: "", type: "bool" }],
} as const;

const fundCampaignFragment = {
  type: "function",
  name: "fundCampaign",
  stateMutability: "nonpayable",
  inputs: [
    { name: "campaignId", type: "bytes32" },
    { name: "amount", type: "uint256" },
  ],
  outputs: [],
} as const;

/**
 * Privy policy for an organization treasury.
 *
 * Privy evaluates these rules before it will sign anything with the wallet:
 * the treasury can only approve the escrow as a spender of its stablecoin and
 * deposit into campaign escrow, on Sepolia, with a per-deposit cap. Everything
 * else (transfers to arbitrary addresses, other contracts, message signing) is
 * denied by default, even if StickerBomb's own server were compromised.
 *
 * `withCalldata: false` produces a coarser address-only version, used if the
 * calldata rules are rejected by the API.
 */
export function buildTreasuryPolicyRules(
  token: Address,
  escrow: Address,
  chainId: number,
  withCalldata = true,
): PolicyRules {
  const onChain = {
    field_source: "ethereum_transaction",
    field: "chain_id",
    operator: "eq",
    value: String(chainId),
  } as const;

  return [
    {
      name: "Approve the escrow to pull stablecoin",
      method: "eth_sendTransaction",
      action: "ALLOW",
      conditions: [
        {
          field_source: "ethereum_transaction",
          field: "to",
          operator: "eq",
          value: token.toLowerCase(),
        },
        onChain,
        ...(withCalldata
          ? [
              {
                field_source: "ethereum_calldata",
                field: "approve.spender",
                abi: [approveFragment],
                operator: "eq",
                value: escrow.toLowerCase(),
              } as const,
            ]
          : []),
      ],
    },
    {
      name: "Deposit campaign budgets into escrow",
      method: "eth_sendTransaction",
      action: "ALLOW",
      conditions: [
        {
          field_source: "ethereum_transaction",
          field: "to",
          operator: "eq",
          value: escrow.toLowerCase(),
        },
        onChain,
        ...(withCalldata
          ? [
              {
                field_source: "ethereum_calldata",
                field: "fundCampaign.amount",
                abi: [fundCampaignFragment],
                operator: "lte",
                value: MAX_FUNDING_UNITS.toString(),
              } as const,
            ]
          : []),
      ],
    },
  ] as unknown as PolicyRules;
}

/** Plain-language summary shown to brands on the treasury page. */
export function describeTreasuryPolicy(symbol: string, withCalldata = true) {
  return [
    "Only Sepolia (chain 11155111) transactions can be signed.",
    withCalldata
      ? `The wallet can approve only the StickerBomb escrow to spend its ${symbol}.`
      : `The wallet can call only the ${symbol} contract and the StickerBomb escrow.`,
    withCalldata
      ? `Each escrow deposit is capped at 10,000 ${symbol}.`
      : "Deposits go only into StickerBomb campaign escrow.",
    "Every other transfer, contract call or signature is refused by Privy.",
  ];
}
