# Contracts

Foundry project for StickerBomb's onchain escrow.

| Contract | Purpose |
| --- | --- |
| [`src/CampaignEscrow.sol`](src/CampaignEscrow.sol) | Holds campaign budgets, reserves per-placement rewards, receives Chainlink CRE verdicts (`onReport`) and pays workers |
| [`src/MockUSDC.sol`](src/MockUSDC.sol) | 6-decimal test stablecoin with open mint, for Sepolia rehearsals |

Deployed addresses: [`deployments/sepolia.json`](deployments/sepolia.json)
(Sourcify-verified).

## Test

```bash
forge install foundry-rs/forge-std --no-git   # once
forge test
```

## Deploy

```bash
export PRIVATE_KEY=0x...                      # testnet-only key
export CRE_FORWARDER=0x15fC6ae953E024d975e77382eEeC56A9101f9F88   # CRE Sepolia simulation forwarder
forge script script/Deploy.s.sol:Deploy --rpc-url https://ethereum-sepolia-rpc.publicnode.com --broadcast
```

Then set `NEXT_PUBLIC_USDC_ADDRESS` and `NEXT_PUBLIC_ESCROW_ADDRESS` in the app's
`.env`, and `consumer_address` in `cre/placement-verifier/config.staging.json`.

To bind an escrow to a different token (for example Circle's Sepolia USDC),
deploy `CampaignEscrow` alone with that token address and set
`NEXT_PUBLIC_USDC_MINTABLE=false`.

## Regenerate the app's ABIs

After changing a contract, rebuild and regenerate `src/lib/chain/abis.ts`:

```bash
forge build
cd .. && node -e '
const fs = require("fs");
const load = (n) => require(`./contracts/out/${n}.sol/${n}.json`).abi;
fs.writeFileSync("src/lib/chain/abis.ts",
  "// Generated from contracts/out by the build step. Do not edit by hand.\n// Regenerate after changing contracts: see contracts/README.md.\n\n" +
  `export const campaignEscrowAbi = ${JSON.stringify(load("CampaignEscrow"), null, 2)} as const;\n\n` +
  `export const erc20Abi = ${JSON.stringify(load("MockUSDC"), null, 2)} as const;\n`);'
```
