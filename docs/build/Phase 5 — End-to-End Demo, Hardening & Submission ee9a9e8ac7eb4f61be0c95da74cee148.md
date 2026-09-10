# Phase 5 — End-to-End Demo, Hardening & Submission

<aside>
5️⃣

**Goal:** Convert the functioning components into one reliable three-minute story and a reproducible public submission.

**Exit condition:** The complete demo succeeds three consecutive times from a clean campaign state, with transaction links and backup evidence prepared.

</aside>

## Scope freeze

At the start of Phase 5, freeze new features. The product must prove one campaign, three assets, one installation, one independent verification, two payouts, one public scan and one cleanup reserve.

Explicitly defer:

- Printer marketplace
- Courier automation
- Production worker network
- Token economics
- Pay-per-scan rewards
- Multi-chain deployment
- Complex disputes
- Native mobile application
- Full admin dashboard

## Canonical demo scenario

> “Deploy three artistic QR posters at approved locations around this event within 45 minutes. Keep the budget under $60 and send visitors to our waitlist.”
> 

Use:

- One brand laptop
- Phone A as installer
- Phone B as verifier
- One judge’s phone as public scanner
- Three pre-printed assets
- Three approved removable surfaces

## Three-minute run

| Time | Scene |
| --- | --- |
| 0:00–0:15 | Brand submits the campaign sentence |
| 0:15–0:30 | Quote appears and brand approves it |
| 0:30–0:45 | Brand funds the escrow with test USDC |
| 0:45–1:00 | Three unique printable QR assets appear |
| 1:00–1:25 | Phone A accepts installation and submits fresh proof |
| 1:25–1:40 | Evidence commitment and confidential verification run |
| 1:40–1:55 | Phone A is denied the verifier role |
| 1:55–2:15 | Phone B completes independent verification |
| 2:15–2:30 | Installer and verifier payouts execute |
| 2:30–2:45 | Judge scans Asset #2; analytics update live |
| 2:45–2:55 | Dashboard shows cleanup reserve still locked |
| 2:55–3:00 | Closing line and architecture |

## Dashboard requirements

The campaign page should tell one chronological story:

1. Campaign brief
2. Approved quote
3. Onchain funding
4. Generated assets
5. Installer assignment
6. Evidence commitment
7. World risk check
8. Chainlink confidential verdict
9. Independent verification
10. Onchain payments
11. Live scans
12. Cleanup reserve

Every onchain event should have an explorer link.

## Reliability work

### State and retries

- [ ]  All background operations are idempotent.
- [ ]  Payment retries cannot create duplicate transfers.
- [ ]  Evidence verification can resume after failure.
- [ ]  Client refresh never loses active job state.
- [ ]  Redirect works even when analytics temporarily fails.
- [ ]  PWA displays pending uploads and retries safely.

### Security

- [ ]  Verify Privy access tokens server-side.
- [ ]  Protect private storage with signed URLs.
- [ ]  Validate MIME type and file size.
- [ ]  Rate-limit campaign, evidence and scan endpoints.
- [ ]  Never expose service-role keys to the browser.
- [ ]  Review contract permissions and withdrawal paths.
- [ ]  Run repository secret scanning.

### Privacy

- [ ]  Raw evidence is private.
- [ ]  Exact coordinates are never displayed publicly.
- [ ]  Selfie images are not stored by StickerBomb.
- [ ]  Public analytics use coarse regions.
- [ ]  Demo participants consent to recording.
- [ ]  Campaign surfaces are explicitly permissioned.

## Prepared demo controls

Use a server-authorized `DEMO_MODE` panel on the campaign page:

- Reset canonical campaign
- Assign Phone A installer
- Assign Phone B verifier
- Retry evidence job
- Refresh chain events
- Advance campaign to removal window

These controls must be labelled and must not fabricate sponsor transactions or verification results.

## Failure matrix

| Failure | Response |
| --- | --- |
| Printer unavailable | Use assets generated earlier by the same build |
| Weak venue internet | Queue phone upload and show pending state |
| Testnet congestion | Show pending transaction and previously confirmed run |
| CRE delay | Show job state and saved successful execution logs |
| Camera permission denied | Switch to prepared second browser/device |
| Scan analytics delay | Show redirect log and refresh realtime subscription |
| Demo reset fails | Use second pre-created campaign |

## Public repository requirements

### README order

1. One-line pitch
2. Problem
3. Demo video
4. How StickerBomb works
5. Onchain trust model
6. Architecture
7. Sponsor integrations
8. Local setup
9. Test the complete flow
10. Contract addresses
11. Transaction examples
12. Limitations and responsible-placement policy

### Required documentation

```
docs/ARCHITECTURE.md
docs/ONCHAIN_FLOW.md
docs/PRIZE_INTEGRATIONS.md
docs/PRIVACY.md
docs/THREAT_MODEL.md
docs/DEMO.md
docs/WORLD_FEEDBACK.md
contracts/README.md
```

## Sponsor evidence

### Privy

- Brand/organization wallet
- Campaign funding transaction
- Functional wallet policy or signer control
- Worker embedded wallets
- Installer and verifier payouts

### World

- Real Selfie Check-compatible flow
- Risk or eligibility decision
- Working sandbox demo
- Required feedback document

### Chainlink

- Confidential handler in public code
- Real protected input
- CRE execution or simulation logs
- Verdict directly affecting payout
- No precise GPS or raw media in public output

## Testing checklist

### Application

- [ ]  Brand creates and reloads campaign.
- [ ]  Three QR assets decode correctly.
- [ ]  Dynamic destination update works.
- [ ]  Public scan appears against the correct asset.

### Worker

- [ ]  PWA installs on both prepared phones.
- [ ]  GPS and camera permission recovery works.
- [ ]  Direct evidence upload works on mobile data.
- [ ]  Self-verification is rejected.

### Blockchain

- [ ]  Contract deployed and verified.
- [ ]  Test USDC funding works.
- [ ]  Evidence hash matches the private bundle.
- [ ]  Payout cannot execute twice.
- [ ]  Cleanup reserve remains locked.

### Full rehearsal

- [ ]  Cold start succeeds.
- [ ]  Clean campaign reset succeeds.
- [ ]  Three consecutive complete demo runs succeed.
- [ ]  Three-minute recording fits the time limit.

## Team split during final phase

| Owner | Final responsibility |
| --- | --- |
| Product/demo lead | Stage script, timing and physical setup |
| Frontend | Brand timeline, worker PWA and loading states |
| Backend | State transitions, jobs and evidence reliability |
| Web3 | Contract, CRE, World and transaction evidence |
| Documentation | README, prize explanations and test instructions |

## Definition of done

The project is ready only when a judge can see:

```
A real campaign request
→ a real funded onchain commitment
→ a real physical placement
→ private evidence verification
→ a distinct human verifier
→ real testnet worker payments
→ a live public scan
→ cleanup money still reserved
```

Closing line:

> Digital ads launch globally in minutes. StickerBomb makes verified physical campaigns work the same way.
>