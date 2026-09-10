# StickerBomb

StickerBomb turns a brand campaign brief into a persistent, measurable physical campaign with independent proof and onchain payouts.

## Current scope

The Brand Portal runs end to end on Sepolia:

- Privy sign-in and server-side access-token verification
- Prisma 7 with Supabase Postgres
- A five-step campaign wizard in a popup: brief, location, placements, artwork, review
- An animated Mapbox globe that flies into the chosen city
- Approved-location inventory with live availability, radius and capacity checks
- A deterministic, versioned quote engine
- **An organization treasury**: a Privy server wallet per brand, constrained by a
  Privy policy, with a second-approver threshold for large fundings
- **Real funding**: the treasury deposits the quote into `CampaignEscrow` on Sepolia
- One uniquely coded printable poster per placement, registered in escrow with
  reserved installer, verifier and cleanup rewards
- Jobs, placements and an independent-verifier rule (installer ≠ verifier)
- **Chainlink CRE confidential verification**: a TEE workflow checks both proofs
  and reports the verdict onchain; the escrow then pays the workers
- A public QR redirect with privacy-safe, per-asset scan attribution

How it fits together, contract addresses, how Privy enables the product and what
the CRE workflow keeps confidential: **[docs/onchain-brand-flow.md](docs/onchain-brand-flow.md)**.

The Worker PWA is not built yet. Until it is, development-only **demo controls**
(`NEXT_PUBLIC_DEMO_MODE=true`) step each placement through installation,
independent verification and confidential verification with two prepared demo
workers, using the same job rules, escrow calls and CRE workflow.

## Requirements

- Node.js 20.19+, 22.12+, or 24+
- npm
- A Privy application
- A Supabase Postgres database
- A Mapbox account (public token)

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in:

   ```env
   NEXT_PUBLIC_PRIVY_APP_ID=
   PRIVY_APP_SECRET=
   DATABASE_URL=
   NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

   `PRIVY_APP_SECRET` and database credentials are server-only. Never prefix either with `NEXT_PUBLIC_`.

   The Mapbox token is public by design because the map runs in the browser. Use a `pk.` token restricted to your domains, never a secret `sk.` token.

   `NEXT_PUBLIC_APP_URL` is embedded in every printed QR code. Set it to a stable address before generating assets you intend to print.

3. Apply database migrations and seed approved locations:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

   When `DATABASE_URL` points to the Supabase transaction pooler on port `6543`, the Prisma CLI automatically uses its session-pooler equivalent on port `5432`. You can instead provide an explicit `DIRECT_URL`.

   The seed creates 21 permissioned demo surfaces and is safe to re-run:

   | City | Surfaces | Districts |
   | --- | --- | --- |
   | New York | 6 | Financial District, Tribeca, Battery Park, Civic Center |
   | Pune | 7 | Koregaon Park, Kalyani Nagar, Viman Nagar, Shivaji Nagar, Baner, Hinjewadi |
   | Cape Town | 8 | City Bowl, Woodstock, Salt River, Observatory, Green Point, Sea Point, V&A Waterfront |

   Surfaces are spread across districts on purpose, so targeting several areas in
   one city reaches more inventory than widening a single radius.

4. Start the application:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`, sign in, create a brand workspace, then run the wizard.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Application entry, membership resolution and brand onboarding |
| `/brand` | Campaign dashboard |
| `/brand/new` | Five-step campaign wizard, opened as a popup over the dashboard |
| `/brand/campaigns/[id]` | Campaign details, escrow balances and placement progress |
| `/brand/placements` | Placement tracking across all campaigns |
| `/brand/payments` | Treasury: Privy wallet, policy, approvals and onchain activity |
| `/brand/analytics` | Live per-asset scan attribution |
| `/worker` | Worker Portal placeholder (Phase 3) |
| `/s/[code]` | Public QR redirect and scan attribution |

### API

| Endpoint | Purpose |
| --- | --- |
| `/api/me` | Authenticated identity and nullable organization membership |
| `/api/onboarding/brand` | Explicit, idempotent brand-workspace onboarding |
| `/api/campaigns` | List and create campaigns |
| `/api/campaigns/[id]` | Read and update an owned campaign |
| `/api/locations/available` | Approved locations within a centre and radius |
| `/api/campaigns/[id]/locations` | Read and replace the assigned locations |
| `/api/campaigns/[id]/quote` | Read or recompute the deterministic quote |
| `/api/campaigns/[id]/quote/approve` | Approve the current quote |
| `/api/campaigns/[id]/fund` | Fund from the Privy treasury into escrow, then issue assets |
| `/api/campaigns/[id]/escrow` | Live escrow balances (GET) and chain sync (POST) |
| `/api/campaigns/[id]/placements` | Placement progress for one campaign |
| `/api/campaigns/[id]/demo` | Development-only demo controls |
| `/api/treasury` | Treasury wallet, policy, balances and history |
| `/api/treasury/top-up` | Testnet only: mint demo tUSDC into the treasury |
| `/api/treasury/settings` | Second-approver threshold |
| `/api/funding-requests/[id]/approve` | A second member approves and the treasury funds |
| `/api/jobs/nearby`, `/api/jobs/[id]/accept`, `/api/jobs/[id]/start` | Worker job APIs |
| `/api/cre/placements/[id]/evidence` | Exact evidence for the CRE enclave only (secret-authenticated) |
| `/api/cre/placements/[id]/verdict` | Verdict callback from the CRE workflow |
| `/api/campaigns/[id]/assets` | List generated assets |
| `/api/campaigns/[id]/assets/generate` | Generate one coded poster per placement |
| `/api/campaigns/[id]/assets/[code]/image` | Render a printable poster |
| `/api/analytics` | Scan analytics across the organization |
| `/api/campaigns/[id]/analytics` | Scan analytics for one campaign |

## Commands

```bash
npm run dev              # Turbopack
npm run dev:webpack      # webpack, for parity checks
npm run typecheck
npm run build            # webpack
npm run build:turbopack  # faster, but currently ships much more JS
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:deploy
npm run db:studio
npm run contracts:test   # Foundry tests for CampaignEscrow
npm run cre:test         # Bun tests for the confidential checks
npm run e2e:sepolia      # full treasury → escrow → CRE → payout run on Sepolia
```

Development runs on Turbopack: it starts in roughly half the time and compiles
routes faster. Production builds stay on webpack deliberately — a Turbopack build
is about twice as fast but currently emits a far larger shared bundle (842 kB of
shared first-load JS against 105 kB), so it is opt-in via `build:turbopack`.

Turbopack ignores the `webpack()` hook in `next.config.ts`, so any bundler
aliases must be declared in both places. Unused optional peer dependencies are
listed once in `unusedOptionalModules` and applied to each.

`next dev` and `next build` share the `.next` directory, and building while a dev server runs will break it. Set `NEXT_DIST_DIR` to build or serve from a separate directory when you need both:

```bash
NEXT_DIST_DIR=.next-verify npm run build
```

## Authorization model

Browser requests send a short-lived Privy access token. API route handlers verify it and may bootstrap only the local user record. `/api/me` resolves an existing organization membership without granting one; brand onboarding happens only through the explicit onboarding endpoint. Every campaign request independently requires an existing `BRAND` or `OPERATOR` membership and scopes database queries to that organization. Client-supplied user IDs, organization IDs and roles are never trusted.

Because the wizard saves partial drafts, the database permits incomplete campaigns. Completeness is proven at the `DRAFT → QUOTED` boundary instead, which is the only invariant that guards quoting and funding.

## Location policy

A brand chooses a campaign **area**: a country, a city and a radius. StickerBomb assigns the **exact surface** from its own approved inventory, and a worker only sees that surface after accepting the job. Only permissioned surfaces are ever used, and a venue's active-campaign limit is enforced when a campaign is funded.

## Scan analytics

Scans are engagement analytics. They never prove a poster was installed and never trigger a worker payout. Total scans and estimated unique scans are reported separately, suspected automated traffic is flagged, and visitor identity is never stored: only salted one-way hashes and a coarse region.
