# Demo runbook

How to run StickerBomb end to end: a brand creates and funds a campaign,
workers stick and verify posters, Chainlink CRE approves them, the escrow pays,
and the brand sees each poster's results.

## 0. Setup (once per machine)

```bash
npm install
npm run db:deploy          # RDS is already migrated; this is a no-op check
npm run build
npm start                  # http://localhost:3000
```

`.env` must have:

| Variable | Demo value | Why |
| --- | --- | --- |
| `NEXT_PUBLIC_DEMO_MODE` | `true` | Shows the operator controls on the campaign page |
| `STICKERBOMB_LENIENT_VERIFICATION` | `true` | Forgives GPS trail, dwell time and challenge timing so honest proofs pass. Wrong poster, reused photo, off-site photo and impossible travel are still rejected |
| `NEXT_PUBLIC_ESCROW_ADDRESS` | `0x1347FB54eFC0E6702637830A90974419f904b700` | Escrow v2 (allows self-verification) |

Payouts need the Chainlink CRE CLI on the machine running the app
(`~/.local/bin/cre`, logged in). Use a production build (`npm run build && npm start`);
`npm run dev` is much slower because of the wallet libraries Privy ships.

## 1. Brand: create a campaign (about 1 minute)

1. Sign in at `/` and open **New campaign**.
2. **Describe the campaign**: one sentence, e.g.
   "10 posters in Bengaluru for our cafe launch, $300, by next Friday".
3. **Where it runs**: pick a city chip (only cities with approved venues are
   offered: Bengaluru, Mumbai, New Delhi, Cape Town, Pune, New York). The area
   defaults to a radius that reaches every venue. Adjust it or add areas, pick
   the poster type (Normal / Magic / Very Magic / NFC), then continue.
4. **Artwork and destination**: upload artwork (optional) and the scan
   destination URL.
5. **Review and fund**: check the quote and fund. The money moves from the
   brand's Privy treasury into the escrow on Sepolia.

## 2. Brand: posters go out

On the campaign page, **Operator controls → Mark printing complete**. Every
placement now has an open job for workers.

## 3. Worker: stick and verify

**On a phone** (`/worker`, sign in):

1. **Find work** lists paid jobs nearby; tap one and accept. The exact venue
   is revealed.
2. Walk there. The pinned bar and the job screen show your distance live.
3. When you're on site, **Stick & verify** unlocks: scan the poster's QR (or
   type the code under it) and take the photo.
4. The job shows "Being verified by Chainlink". About a minute later it's
   verified and paid, and **Earnings** shows the installer and verifier fees.

**Without a phone**, use the operator controls on each placement row:

1. **Send a worker**: a demo worker accepts the job.
2. **Stick & verify on site**: records the walk to the venue and the proof,
   then starts Chainlink CRE. About a minute later the placement is VERIFIED
   and the escrow has paid the worker.
3. To show a rejection, use **Stick & verify from the wrong place** instead
   (a photo about 2 km away). CRE rejects it and the money stays locked.
   **Recapture proof** then fixes it.

About 10% of self-verified posters are picked at random for a spot check by a
second worker (0% in lenient mode). The escrow pays nobody until the check
passes.

## 4. Brand: watch it live

While workers are active, the campaign page shows:

- **Live map**: venue fences, a moving dot for each worker, and distance to the
  venue.
- **Results so far**: posters up, scans, people, landed and signed up, per
  poster.
- **Escrow**: funded, paid out and held amounts, with Sepolia links.

When every poster is verified, the campaign becomes **LIVE**.

## 5. Results

1. **Operator controls → Sync scan activity** fills in scans, visitors,
   landings and signups for every poster that's up. Scanning a real poster
   also adds a scan.
2. **End campaign** (or let the deadline pass) marks the campaign
   **COMPLETE**. The live map is hidden, and **Campaign results** keeps the
   per-poster table and totals.

## Automated check

```bash
npm start -- -p 3100 &
node scripts/run-ts.cjs scripts/e2e-worker.ts                    # self-verified
E2E_SPOT_CHECK=1 node scripts/run-ts.cjs scripts/e2e-worker.ts   # spot check
```

Both runs fund a campaign on Sepolia, stick and verify a poster, run Chainlink
CRE, and confirm the escrow payouts.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Fund fails with "locations were taken" | The venue is full from earlier campaigns. End them, or pick another area |
| Stuck on "Being verified" | The CRE CLI isn't installed or logged in on this machine |
| Worker can't unlock Stick & verify | Location permission is off; in lenient mode the server still accepts the proof |
