# 06 — Portal User Journeys & Diagrams

<aside>
🗺️

**Two portals, one system**

The Brand Portal creates, funds and monitors campaigns. The Worker Portal lets installers, verifiers and cleanup workers complete paid physical tasks. Public visitors only interact with a fast QR redirect.

</aside>

## Brand Portal

### Routes

```
/brand                    Campaigns
/brand/placements         Placement tracking
/brand/payments           Funding and payouts
/brand/analytics          Scan attribution
/brand/new                Full-screen campaign wizard
/brand/campaigns/[id]
```

Navigation is Campaigns, Placements, Payments and Analytics. New Campaign is a button that opens the wizard, not a navigation item. There is no admin dashboard.

### Journey

```mermaid
flowchart TD
    A["Brand opens Brand Portal"] --> B["Sign in with Privy"]
    B --> C["Start new campaign wizard"]
    C --> D["Describe goal, deadline and budget"]
    D --> D2["Select country and city on the globe"]
    D2 --> D3["Choose campaign area and approved locations"]
    D3 --> E["Upload artwork and destination"]
    E --> F["Review quote and placement plan"]
    F --> G{"Approve?"}
    G -->|No| H["Edit campaign"]
    H --> F
    G -->|Yes| I["Fund onchain escrow"]
    I --> J["Generate unique QR assets"]
    J --> K["Installation jobs open"]
    K --> L["Track worker and verification progress"]
    L --> M{"Placement verified?"}
    M -->|No| N["Recapture or review"]
    N --> L
    M -->|Yes| O["Worker payments release"]
    O --> P["Placement becomes live"]
    P --> Q["Public scans update analytics"]
    Q --> R["Campaign expires and cleanup begins"]
    R --> S["Removal verified; campaign completes"]
```

### In simple words

1. Brand signs in.
2. Brand describes the campaign in one sentence and corrects the detected values.
3. Brand selects a country and city on the animated globe.
4. Brand chooses the campaign area; StickerBomb proposes approved locations.
5. Brand uploads artwork and destination URL.
6. StickerBomb calculates the deterministic quote.
7. Brand approves and funds the campaign.
8. Unique QR assets are created.
9. Workers install and verify the placements.
10. Verified work releases payments.
11. Public scans appear in analytics.
12. Cleanup is completed from the reserved budget.

### Brand campaign page

- Brief and approved quote
- Funding transaction
- QR asset gallery
- Placement map
- Installation and verification timeline
- Evidence receipts
- Worker payouts
- Scans by asset
- Cleanup reserve and removal state

## Worker Portal

The Worker Portal is one PWA with four tabs:

```
Install | Verify | Cleanup | Earnings
```

### Routes

```
/worker
/worker/jobs
/worker/jobs/[id]
/worker/active/[id]
/worker/verify
/worker/cleanup
/worker/earnings
```

### Journey

```mermaid
flowchart TD
    A["Worker opens Worker PWA"] --> B["Sign in with Privy"]
    B --> C["Embedded wallet created"]
    C --> D["Complete World check"]
    D --> E{"Choose task type"}

    E -->|Install| F["See nearby jobs"]
    F --> G["View approximate area, reward and deadline"]
    G --> H["Accept job"]
    H --> I["Reveal exact map, spot photo and instructions"]
    I --> J["Travel, scan QR and place asset"]
    J --> K["Complete fresh camera challenge"]
    K --> L["Submit GPS and video proof"]
    L --> M{"Automated checks"}
    M -->|Fail| N["Recapture proof"]
    N --> K
    M -->|Pass| O["Wait for independent verifier"]

    E -->|Verify| P["See verification jobs"]
    P --> Q["Accept verification"]
    Q --> R{"Same participant as installer?"}
    R -->|Yes| S["Block verification"]
    R -->|No| T["Reveal exact placement"]
    T --> U["Scan QR and submit second proof"]
    U --> V{"Final verification"}
    V -->|Reject| W["Payment remains locked"]
    V -->|Accept| X["Installer and verifier paid"]

    E -->|Cleanup| Y["See expired placements"]
    Y --> Z["Accept cleanup"]
    Z --> AA["Remove asset and submit proof"]
    AA --> AB["Cleanup verified and paid"]
```

### Installer journey

1. Sign in and complete the required World check.
2. View approximate job area, reward and deadline.
3. Accept a job.
4. Receive exact map, spot photo and instructions.
5. Travel to the approved location.
6. Scan the assigned asset.
7. Install it and complete a fresh challenge.
8. Upload location and video proof.
9. Wait for automated checks and independent verification.
10. Receive payment after final acceptance.

### Verifier journey

1. Open the Verify tab.
2. View approximate verification jobs.
3. Accept one task.
4. Backend checks that the participant did not install it.
5. Receive the exact location.
6. Visit and scan the physical asset.
7. Complete a different challenge.
8. Submit independent evidence.
9. Final verification compares both proofs.
10. Accepted verification releases installer and verifier payments.

### Cleanup journey

1. Campaign expires.
2. Removal job appears.
3. Worker accepts and receives the exact location.
4. Worker scans and removes the asset.
5. Worker records the cleared surface.
6. Verified removal releases the reserved cleanup reward.

## Portal connection

```mermaid
flowchart LR
    Brand["Brand Portal"]

    subgraph Worker["Worker Portal"]
        Installer["Installer"]
        Verifier["Verifier"]
        Cleanup["Cleanup worker"]
    end

    Escrow["Onchain escrow"]
    Checks["Verification system"]
    Public["Public scanner"]
    Analytics["Scan analytics"]

    Brand -->|"Fund"| Escrow
    Brand -->|"Open jobs"| Installer
    Installer -->|"Proof"| Checks
    Checks -->|"Verification job"| Verifier
    Verifier -->|"Second proof"| Checks
    Checks -->|"VERIFIED"| Escrow
    Escrow -->|"Pay"| Installer
    Escrow -->|"Pay"| Verifier
    Public -->|"Scan QR"| Analytics
    Analytics -->|"Results"| Brand
    Brand -->|"Expiry"| Cleanup
    Cleanup -->|"Removal proof"| Checks
    Escrow -->|"Cleanup payment"| Cleanup
```

## Public QR journey

```
Scan bomb.wtf/a8k2
→ identify the physical asset
→ record privacy-safe attribution
→ update brand analytics
→ redirect to the brand destination
```

The visitor needs no account and does not install the Worker PWA. Raw scan counts never trigger worker payments.