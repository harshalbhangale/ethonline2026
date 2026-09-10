# Phase 4 — Onchain Escrow, Identity & Confidential Verification

<aside>
4️⃣

**Goal:** Make funding, proof commitments, verification and payouts genuinely onchain while keeping sensitive evidence private.

**Exit condition:** A funded testnet campaign records an evidence hash, accepts a confidential verification result and pays installer and verifier wallets while retaining the cleanup reserve.

</aside>

## Trust boundary

> Money, commitments and verification receipts go onchain. Raw video, exact GPS, selfies and visitor analytics stay offchain.
> 

## Target network

Use one EVM testnet only. Default to Ethereum Sepolia unless the current Chainlink CRE delivery path is materially easier on another supported EVM testnet. Confirm sponsor compatibility before contract implementation.

## Work package A — `CampaignEscrow.sol`

One contract is enough.

### Campaign

```solidity
struct Campaign {
    address brand;
    address paymentToken;
    uint256 totalBudget;
    uint256 remainingBudget;
    uint256 cleanupReserve;
    uint64 deadline;
    CampaignStatus status;
}
```

### Placement

```solidity
struct Placement {
    uint256 campaignId;
    address installer;
    address verifier;
    uint256 installerReward;
    uint256 verifierReward;
    bytes32 evidenceHash;
    PlacementStatus status;
}
```

### Functions

```solidity
createCampaign(...)
fundCampaign(...)
createPlacement(...)
assignInstaller(...)
assignVerifier(...)
commitEvidenceHash(...)
finalizePlacement(...)
completeRemoval(...)
refundRemainingBudget(...)
pauseCampaign(...)
```

### Events

```solidity
CampaignCreated
CampaignFunded
PlacementCreated
WorkerAssigned
EvidenceCommitted
PlacementFinalized
PaymentReleased
RemovalCompleted
CampaignRefunded
```

Use OpenZeppelin `SafeERC20`, `AccessControl`, `Pausable` and `ReentrancyGuard`.

## Work package B — Contract invariants

- [ ]  Contract cannot pay more than funded budget.
- [ ]  Placement cannot be paid twice.
- [ ]  Installer and verifier wallets must differ.
- [ ]  Evidence hash must match the finalized verification.
- [ ]  Cleanup reserve cannot be spent on installation rewards.
- [ ]  Cancelled campaigns cannot create new placements.
- [ ]  Refunds respect completed and reserved milestones.
- [ ]  Operator cannot withdraw campaign funds arbitrarily.

## Work package C — Privy

Use Privy as the financial operating layer:

- Brand authentication
- Organization or campaign funding wallet
- Worker embedded wallets
- Contract transactions
- Campaign spending policy
- Installer and verifier USDC payouts

The repository already has a Privy React integration; extend it rather than adding a second wallet system.[[1]](https://github.com/harshalbhangale/ethonline2026/blob/main/src/components/PrivyProviders.tsx)

### Funding flow

```
Brand approves quote
→ Privy wallet approves test USDC
→ create/fund campaign transaction
→ contract event indexed by backend
→ campaign becomes FUNDED
```

### Payout flow

```
Final verification accepted
→ escrow validates evidence commitment
→ installer transfer
→ verifier transfer
→ cleanup reserve remains locked
```

## Work package D — World Selfie Check

Use Selfie Check as a low-friction liveness and risk signal—not as perfect proof of global uniqueness.[[2]](https://ethglobal.com/events/ethonline2026/prizes)

Trigger it:

- Before the first worker job
- Before a high-value job
- When evidence risk is elevated
- Before payout if the session changed or appears suspicious

Store only the minimal credential result or nullifier material required by the integration. Never store selfie images in the application database.

Required demo:

```
Automated or unchecked session attempts job
→ Selfie Check required
→ real worker completes it
→ job becomes eligible
```

Also produce the sponsor-required integration feedback document.

## Work package E — Chainlink CRE confidential workflow

The confidential handler processes:

- Exact approved coordinates
- Worker coordinates
- Private media references
- Challenge details
- Artwork fingerprint
- Fraud thresholds
- Installer and verifier evidence

Inside the handler:

1. Fetch or decrypt the evidence bundle.
2. Check the confidential geofence.
3. Check artwork and QR agreement.
4. Check challenge completion.
5. Check installer/verifier consistency.
6. Compute the evidence commitment.
7. Return verdict, reason codes and hash.

Public result:

```json
{
  "verdict": "VERIFIED",
  "evidenceHash": "0x92a...",
  "reasonCodes": [
    "QR_MATCH",
    "GEOFENCE_PASS",
    "CHALLENGE_PASS",
    "INDEPENDENT_CONFIRMATION"
  ]
}
```

The workflow must run through a real CRE CLI simulation or supported live deployment and must directly affect payout eligibility.[[2]](https://ethglobal.com/events/ethonline2026/prizes)

## Work package F — Onchain finalization

Preferred flow:

```
CRE confidential verdict
→ authorized report or delivery
→ finalizePlacement
→ escrow transfers rewards
```

If direct CRE delivery is not available in the chosen demo environment, pass the verifiable CRE output through an explicitly authorized relayer and document that trust boundary. Do not imply decentralization that the implementation does not provide.

## Work package G — Index chain events

Backend watches:

- Campaign funding
- Evidence commitments
- Finalization
- Payments
- Cleanup
- Refunds

Store transaction hash, block number and chain ID. The database is a query cache; contract events remain the financial source of truth.

## Onchain versus offchain

| Item | Location |
| --- | --- |
| Campaign funding | Onchain |
| Rewards and cleanup reserve | Onchain |
| Worker payout wallets | Onchain |
| Evidence commitment | Onchain |
| Final verdict | Onchain |
| Raw video | Private storage |
| Exact GPS | Confidential input |
| Selfie | World flow; not application storage |
| Scan analytics | Postgres |
| Artwork | Object storage with hash |

## Contract and integration tests

- [ ]  Fund campaign with test USDC.
- [ ]  Reject unfunded placement payout.
- [ ]  Reject duplicate finalization.
- [ ]  Reject evidence-hash mismatch.
- [ ]  Retain cleanup reserve after installer payment.
- [ ]  Emit usable explorer-linked events.
- [ ]  Reject self-verification wallet.
- [ ]  Show successful CRE execution evidence.
- [ ]  Verify no raw GPS or video reaches public logs.

## Exit test

```
Brand funds campaign onchain
→ Worker A evidence stored privately
→ evidence hash committed onchain
→ Worker B completes independent verification
→ Chainlink CRE returns VERIFIED
→ finalizePlacement executes
→ Worker A and Worker B receive test USDC
→ cleanup reserve remains in escrow
```