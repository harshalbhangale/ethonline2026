# Phase 3 — Worker PWA, Jobs & Physical Proof

<aside>
3️⃣

**Goal:** Build the mobile experience that turns a campaign asset into verifiable physical work.

**Exit condition:** Worker A installs one asset from a phone; Worker B independently verifies it; Worker A cannot verify their own placement.

</aside>

## Product surface

This is not a second application repository. It is a mobile-first route group inside the existing Next.js project:

```
/worker
/worker/jobs
/worker/jobs/[id]
/worker/active/[id]
/worker/verify
/worker/cleanup
/worker/earnings
```

The marketing site links to `/worker`. The installed PWA opens directly at `/worker/jobs`.

## Work package A — PWA foundation

Create:

```
public/worker.webmanifest
public/sw.js
public/icons/worker-192.png
public/icons/worker-512.png
src/app/worker/layout.tsx
```

Manifest essentials:

```json
{
  "id": "/worker",
  "name": "StickerBomb Worker",
  "short_name": "StickerBomb",
  "start_url": "/worker/jobs?source=pwa",
  "scope": "/worker/",
  "display": "standalone",
  "theme_color": "#ff5c00",
  "background_color": "#0a0a0a"
}
```

- [ ]  Use a mobile bottom navigation rather than the brand sidebar.
- [ ]  Cache the application shell.
- [ ]  Store an unfinished evidence draft locally.
- [ ]  Show explicit offline and upload-pending states.
- [ ]  Do not promise reliable background geofencing from a PWA.

## Work package B — Worker onboarding

Initial flow:

```
Privy sign-in
→ choose worker role
→ enter display name
→ permit camera
→ permit foreground location
→ create worker profile
→ view nearby jobs
```

World Selfie Check is connected in Phase 4. Phase 3 should expose an onboarding checkpoint that can later call it.

### Worker fields

```
user_id
wallet_address
roles
risk_status
selfie_check_status
rating
completed_jobs
active_job_id
created_at
```

## Work package C — Job system

Job roles:

```
INSTALLER
VERIFIER
CLEANUP
```

Job states:

```
OPEN
RESERVED
ACCEPTED
IN_PROGRESS
PROOF_SUBMITTED
ACCEPTED_PROOF
REJECTED_PROOF
PAID
CANCELLED
EXPIRED
```

### Required rules

- One active installation job per worker.
- A worker cannot verify their own placement.
- Exact locations appear only after job acceptance.
- Reveal locations one at a time.
- Verifier identity remains hidden from the installer.
- Job acceptance and proof submission are server-authorized.

## Work package D — Placement model

```
id
campaign_id
asset_id
location_id
installer_job_id
verifier_job_id
installer_user_id
verifier_user_id
status
installation_evidence_id
verification_evidence_id
onchain_placement_id
created_at
```

Use the approved locations seeded in Phase 2. Six permissioned demo locations exist; a single demo campaign normally uses three of them. Venue approval, placement instructions and maximum active campaigns are stored on the location record rather than duplicated here.

## Work package E — Fresh proof challenge

When the worker reaches a placement, generate a short-lived challenge:

```
Show the complete poster.
Step three metres backwards.
Pan toward the venue entrance.
Display today’s random symbol.
```

Challenge record:

```
id
placement_id
worker_id
random_symbol
instructions
expires_at
used_at
```

The worker must request the challenge immediately before capture. Do not accept a client-generated challenge ID.

## Work package F — Evidence capture

Capture:

- Physical QR identity
- Foreground coordinates
- Timestamp
- Five-to-ten-second guided video
- Challenge response
- Device/session metadata

Do not upload large video files through Vercel route handlers.

```
Worker requests signed upload URL
→ phone uploads directly to private storage
→ worker submits object path, hash and metadata
→ backend marks evidence SUBMITTED
```

### Evidence states

```
DRAFT
UPLOADING
SUBMITTED
PROCESSING
ACCEPTED
REJECTED
NEEDS_RECAPTURE
```

## Work package G — Deterministic pre-checks

Before sponsor verification:

- Correct assigned QR
- Challenge not expired
- Timestamp in job window
- Coordinates near approved geofence
- Media hash not previously used
- Worker owns the accepted job
- Installer and verifier accounts differ

Return explainable reasons such as:

```
WRONG_QR
OUTSIDE_GEOFENCE
CHALLENGE_EXPIRED
DUPLICATE_MEDIA
SELF_VERIFICATION
```

## Work package H — Independent verifier flow

After installer evidence passes initial checks:

1. Create a verifier job.
2. Hide it from the installer.
3. Worker B accepts.
4. Worker B scans the same physical QR.
5. Worker B receives a different challenge.
6. Worker B submits fresh evidence.
7. Placement moves to `READY_FOR_FINAL_VERIFICATION`.

## Demo controls without an admin product

Add development-only controls to the campaign page:

- Assign prepared installer
- Mark printing complete
- Open verifier job
- Retry evidence processing
- Reset demo campaign
- Advance expiry

Guard them with server-side authorization and `DEMO_MODE`. Do not build a separate admin dashboard.

## APIs

```
GET  /api/jobs/nearby
POST /api/jobs/:id/accept
POST /api/jobs/:id/start
POST /api/placements/:id/challenge
POST /api/evidence/upload-url
POST /api/placements/:id/evidence
GET  /api/worker/earnings
```

## Tests

- [ ]  PWA installs and launches at `/worker/jobs`.
- [ ]  Camera denial produces a recovery path.
- [ ]  Location denial produces a recovery path.
- [ ]  A worker cannot accept two installation jobs.
- [ ]  Worker A cannot verify Worker A’s placement.
- [ ]  Reused media is rejected.
- [ ]  Expired challenge is rejected.
- [ ]  Video uploads directly to private storage.

## Exit test

```
Phone A installs PWA
→ accepts installer job
→ reaches approved location
→ scans asset and completes challenge
→ uploads proof
→ installer proof passes deterministic checks
→ Phone A is blocked from verifier task
→ Phone B accepts and submits independent proof
```