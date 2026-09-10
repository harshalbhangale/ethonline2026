# 03 — StickerBomb Build Plan

<aside>
🛠️

**Build target**

Turn the existing Next.js frontend into a complete hackathon product: a brand creates and funds a campaign, unique physical assets are generated, one worker installs an asset, another verifies it, onchain payments release and a public scan updates analytics.

</aside>

## Current baseline

The repository already provides the brand-facing visual foundation: Next.js, React, TypeScript, Tailwind, a campaign sentence composer, mock analytics and initial Privy integration.[[1]](https://github.com/harshalbhangale/ethonline2026)

The missing work is the real product underneath it:

- Persistent campaigns and backend APIs
- QR asset generation and redirects
- Worker PWA and job state machine
- Private evidence capture
- World verification
- Chainlink confidential evaluation
- Onchain escrow and real testnet payouts

## Scope

### Build

```
One Next.js application
├── Brand Portal
├── Worker PWA
├── Public QR redirects
└── Backend route handlers

Supabase
├── Postgres
├── private evidence storage
└── realtime events

Web3
├── Privy wallets
├── World verification
├── Chainlink CRE
└── CampaignEscrow contract
```

### Do not build

- Marketing landing page— alex working on it.
- Full admin dashboard
- Separate native application
- Printer or courier marketplace
- Multi-chain support
- Pay-per-scan rewards
- Token economics
- Production dispute system

## Five-phase delivery plan

| Phase | Outcome | Exit proof |
| --- | --- | --- |
| 1. Foundation | Authentication, database, APIs and persistent campaigns | Campaign survives refresh |
| 2. Brand and QR | Quote, artwork, unique assets, redirects and analytics | Three QRs report separately |
| 3. Worker PWA | Jobs, camera, GPS and two-person proof | Phone A installs; Phone B verifies |
| 4. Onchain trust | Escrow, World, Chainlink and Privy payouts | Verified work pays two wallets |
| 5. Demo and submission | Reliable integrated run and public documentation | Three successful rehearsals |

## Dependency order

```
Persistent campaign
→ quote and asset IDs
→ QR redirects and scans
→ placement and job IDs
→ mobile evidence capture
→ deterministic checks
→ World and Chainlink verification
→ onchain finalization
→ Privy payout
→ demo hardening
```

Do not begin with isolated sponsor demos. Every integration must change the same placement outcome.

## Team workstreams

| Workstream | Responsibility |
| --- | --- |
| Brand frontend | Campaign creation, quote, assets and timeline |
| Worker frontend | PWA, jobs, camera, GPS and proof capture |
| Backend | Database, APIs, storage, queues and state transitions |
| Web3 | Contract, Privy, World and Chainlink CRE |
| Product/demo | Approved locations, physical assets, rehearsal and submission |

## Global engineering rules

1. Store money in integer token units.
2. Verify authentication and authorization on the server.
3. Upload videos directly to private storage.
4. Keep raw video, selfies and exact GPS offchain and out of public logs.
5. Make verification and payouts idempotent.
6. Use contract events as the financial source of truth.
7. Reveal exact locations only after job acceptance.
8. Prevent the installer from verifying their own placement.
9. Keep QR redirects fast even when analytics or Web3 services fail.
10. Use only permissioned physical surfaces.

## Build documentation

[00 — System Architecture & Scope](03%20%E2%80%94%20StickerBomb%20Build%20Plan/00%20%E2%80%94%20System%20Architecture%20&%20Scope%20fbbbd5a808db4387acf3316654eeab71.md)

[Phase 1 — Foundation, Data & Real Campaigns](03%20%E2%80%94%20StickerBomb%20Build%20Plan/Phase%201%20%E2%80%94%20Foundation,%20Data%20&%20Real%20Campaigns%20fbd7fed52c9744fea6b7c5d3a2e5616d.md)

[Phase 2 — Brand Flow, QR Assets & Live Attribution](03%20%E2%80%94%20StickerBomb%20Build%20Plan/Phase%202%20%E2%80%94%20Brand%20Flow,%20QR%20Assets%20&%20Live%20Attribution%2099f3f70bf50349f89a033997139e45e9.md)

[Phase 3 — Worker PWA, Jobs & Physical Proof](03%20%E2%80%94%20StickerBomb%20Build%20Plan/Phase%203%20%E2%80%94%20Worker%20PWA,%20Jobs%20&%20Physical%20Proof%20d1d6f2242d344c778d7577224e3c714a.md)

[Phase 4 — Onchain Escrow, Identity & Confidential Verification](03%20%E2%80%94%20StickerBomb%20Build%20Plan/Phase%204%20%E2%80%94%20Onchain%20Escrow,%20Identity%20&%20Confidential%20%209a4eb86d0b014d07a3645111219d3718.md)

[Phase 5 — End-to-End Demo, Hardening & Submission](03%20%E2%80%94%20StickerBomb%20Build%20Plan/Phase%205%20%E2%80%94%20End-to-End%20Demo,%20Hardening%20&%20Submission%20ee9a9e8ac7eb4f61be0c95da74cee148.md)

[06 — Portal User Journeys & Diagrams](03%20%E2%80%94%20StickerBomb%20Build%20Plan/06%20%E2%80%94%20Portal%20User%20Journeys%20&%20Diagrams%20d75ee9168eb840abad16803959a49d55.md)