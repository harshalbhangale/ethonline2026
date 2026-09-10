# Phase 1 — Foundation, Data & Real Campaigns

<aside>
1️⃣

**Goal:** Turn the current frontend prototype into a real application that can authenticate users and persist campaigns.

**Exit condition:** A signed-in brand creates a campaign, refreshes the browser and sees the same campaign loaded from Postgres.

</aside>

## Current baseline

The repository already contains a Next.js 15 and React 19 frontend, Privy scaffolding, a campaign sentence parser and mock analytics.[[1]](https://github.com/harshalbhangale/ethonline2026/blob/main/package.json)[[2]](https://github.com/harshalbhangale/ethonline2026/blob/main/src/components/BriefComposer.tsx)

The current campaign composer only updates local React state, while the analytics page reads static values from `src/lib/mock.ts`.[[3]](https://github.com/harshalbhangale/ethonline2026/blob/main/src/lib/mock.ts)

### Reuse

- Existing visual system and Tailwind styles
- `BriefComposer`
- `parseBrief`
- `AppShell` for the brand experience
- Privy provider and wallet button
- Existing charts as presentation components

### Do not keep as architecture

- `/` as the permanent campaign page
- Mock campaign state
- Mock analytics as application data
- One desktop shell for both brands and workers
- Client-only authorization

## Technical decisions

| Area | Decision |
| --- | --- |
| Frontend | One Next.js App Router application |
| Backend | Next.js route handlers for the hackathon |
| Database | Supabase Postgres |
| Storage | Supabase private and public buckets |
| Validation | Zod shared between forms and APIs |
| Database access | Prisma ORM with Prisma Migrate |
| Authentication | Privy |
| Deployment | Vercel |
| Long jobs | [Trigger.dev](http://Trigger.dev) added only when Phase 3 requires it |

## Route restructuring

```
/                         Application entry, role router and explicit brand onboarding
/brand                    Authorized campaign list and new-campaign modal
/brand/campaigns/[id]     Authorized campaign details
/worker                   Worker onboarding placeholder
/api/me                   Authenticated identity and nullable membership
/api/onboarding/brand     Explicit brand-workspace onboarding
/api/campaigns            Brand-authorized campaign endpoints
```

The separate marketing site will link directly to `/brand` and `/worker`. Direct brand links must resolve an existing server-side membership before rendering the portal. Campaign creation opens as a modal inside the Brand Portal; do not build another landing page.

## Work package A — Repository hygiene

- [ ]  Add a complete `.env.example`.
- [ ]  Document Node version and package manager.
- [ ]  Make `npm run build` and linting deterministic.
- [ ]  Remove or justify the unrelated `@farcaster/mini-app-solana` dependency.
- [ ]  Add `README.md` with setup instructions and current scope.
- [ ]  Add a CI workflow for type-check and build.
- [ ]  Protect `main`; use short feature branches.

### Required environment variables

```env
NEXT_PUBLIC_PRIVY_APP_ID=
PRIVY_APP_SECRET=
DATABASE_URL=          # pooled Supabase Postgres URL used by the application
DIRECT_URL=            # direct Supabase Postgres URL used by Prisma Migrate
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
```

`DATABASE_URL`, `DIRECT_URL`, `PRIVY_APP_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are server-only and must never use the `NEXT_PUBLIC_` prefix. Phase 1 application queries use Prisma through `DATABASE_URL`; the Supabase browser and service-role variables are retained for later Storage and Realtime work.

## Work package B — Fix authentication foundation

The current Privy wrapper returns children without a provider when the app ID is missing, while `AppShell` always calls Privy hooks. Fix this before further development.[[4]](https://github.com/harshalbhangale/ethonline2026/blob/main/src/components/PrivyProviders.tsx)[[5]](https://github.com/harshalbhangale/ethonline2026/blob/main/src/components/AppShell.tsx)

- [ ]  Require valid Privy configuration in deployed environments.
- [ ]  Add server-side verification of Privy access tokens.
- [ ]  Create only a local user record on first authenticated request.
- [ ]  Add roles: `brand`, `worker`, `operator`.
- [ ]  Resolve existing memberships without granting a role during authentication.
- [ ]  Create a brand organization and `brand` membership only through an explicit onboarding action.
- [ ]  Redirect a brand to `/brand` and a worker to `/worker`.
- [ ]  Never authorize payments, campaigns or job completion from a client-side role value.

## Work package C — Initial database

- [ ]  Initialize Prisma with the PostgreSQL provider.
- [ ]  Define the Phase 1 data model in `prisma/schema.prisma`.
- [ ]  Configure pooled runtime access through `DATABASE_URL` and direct migration access through `DIRECT_URL`.
- [ ]  Create a shared server-only Prisma client that avoids duplicate clients during Next.js development reloads.
- [ ]  Generate and apply the initial migration with Prisma Migrate.
- [ ]  Use Prisma Studio for local inspection of users, organizations and campaigns.

Create these first tables:

```
users
organizations
organization_members
campaigns
campaign_quotes
campaign_assets
locations
jobs
placements
scans
```

### Minimum campaign fields

```
id
organization_id
name
brief_text
placement_count
area
budget_limit
currency
destination_url
deadline
status
created_by
created_at
updated_at
```

### Initial status enum

```
DRAFT
QUOTED
FUNDED
ASSETS_READY
DEPLOYING
VERIFYING
LIVE
EXPIRED
REMOVING
COMPLETE
CANCELLED
DISPUTED
```

## Work package D — Real campaign APIs

```
POST /api/campaigns
GET  /api/campaigns
GET  /api/campaigns/:id
PATCH /api/campaigns/:id
POST /api/campaigns/:id/quote
```

Rules:

- Every request validates a Privy token.
- Every payload is checked with Zod.
- A user may only access campaigns belonging to their organization.
- Status transitions occur through backend functions rather than arbitrary client updates.
- Store money as integer minor units, never floating point.

## Work package E — Connect the existing UI

- [ ]  Open `BriefComposer` as a modal from `/brand` rather than navigating to a separate creation page.
- [ ]  Keep `parseBrief` as a UI convenience, not a trusted backend parser.
- [ ]  Submit the completed form to `POST /api/campaigns`.
- [ ]  Redirect to `/brand/campaigns/[id]` after creation.
- [ ]  Build `/brand` from real database rows.
- [ ]  Add loading, empty, failure and retry states.
- [ ]  Replace “Campaign drafted” local state with a saved database record.

## Minimal tests

- [ ]  Unauthenticated requests receive `401`.
- [ ]  Brand A cannot load Brand B’s campaign.
- [ ]  Campaign creation rejects invalid budget and destination values.
- [ ]  A created campaign survives a browser refresh.
- [ ]  Production build succeeds without mock environment values.

## Suggested ownership

| Owner | Responsibility |
| --- | --- |
| Frontend | Route restructure, brand screens and API integration |
| Backend | Schema, auth middleware and campaign endpoints |
| Product | Status definitions, form fields and acceptance testing |

## Exit test

Record one uninterrupted flow:

```
Sign in
→ create campaign from the existing sentence composer
→ receive database campaign ID
→ open campaign page
→ refresh browser
→ campaign and fields remain correct
```

Do not begin sponsor integrations until this passes.