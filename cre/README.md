# StickerBomb placement verifier (Chainlink CRE confidential workflow)

Decides whether a physical placement was really installed and independently
verified, without exposing the evidence, then tells `CampaignEscrow` to pay.

- Workflow: [`placement-verifier/main.ts`](placement-verifier/main.ts)
- Checks: [`placement-verifier/checks.ts`](placement-verifier/checks.ts) (tests: `bun test`)
- Trigger: HTTP, payload `{ "placementId": "<id>" }`
- Handler: registered with **`handlerInTee`**, so it runs in a TEE

## Confidentiality boundary

**Inside the enclave**

| Input | Why it is sensitive |
| --- | --- |
| `evidence_api_key` (Vault DON secret) | Grants access to raw evidence |
| `geofence_salt` (Vault DON secret) | Keeps the public evidence commitment from being reversed into coordinates |
| Evidence bundle from `GET /api/cre/placements/:id/evidence` | Exact GPS of both workers, exact position of the approved surface, worker identities, challenge responses, media fingerprints |
| Intermediate results | Distances, per-check outcomes |

**Leaves the enclave**

- `approved` (bool) and reason codes such as `INSTALLER:OUTSIDE_GEOFENCE`
- A salted keccak256 commitment to the evidence
- A DON-signed report `abi.encode(bytes32 placementId, bool approved, bytes32 evidenceHash)`
  written to `CampaignEscrow.onReport`, and the same verdict posted to
  `POST /api/cre/placements/:id/verdict`

## Checks

| Code | Rule |
| --- | --- |
| `WRONG_QR` | The scanned code must be this placement's asset |
| `OUTSIDE_GEOFENCE` | Proof within the surface's radius (widened by GPS accuracy, never beyond 2×) |
| `CHALLENGE_EXPIRED` | Captured inside the server-issued challenge window |
| `CHALLENGE_MISMATCH` | The response matches the challenge |
| `DUPLICATE_MEDIA` | Media fingerprint not reused across placements or roles |
| `SELF_VERIFICATION` | Installer and verifier are different people |
| `MISSING_INSTALLATION` / `MISSING_VERIFICATION` | Both proofs present |

## Run

Secrets come from `cre/.env` (never committed):

```env
CRE_ETH_PRIVATE_KEY=...                  # pays for the broadcast report in simulation
STICKERBOMB_EVIDENCE_API_KEY=...         # same value as the app's .env
STICKERBOMB_GEOFENCE_SALT=...            # same value as the app's .env
```

With the app running (the config points at `http://127.0.0.1:3000`):

```bash
cd cre/placement-verifier && bun install && cd ..
cre workflow simulate ./placement-verifier --target staging-settings \
  --non-interactive --trigger-index 0 \
  --http-payload '{"placementId":"<placement id>"}' --broadcast
```

The app starts the same command itself from the campaign page's
**Run confidential verification** demo control (`src/lib/verification/runner.ts`),
with a per-run config pointing at its own URL and escrow.

Recorded output of a successful run: [`../docs/evidence/cre-simulation-placement-approved.txt`](../docs/evidence/cre-simulation-placement-approved.txt).

The CRE account's deploy access is not enabled yet, so the workflow runs in the
CRE CLI simulator with `--broadcast`. The escrow trusts the Sepolia simulation
forwarder `0x15fC6ae953E024d975e77382eEeC56A9101f9F88`; after deploying to the
DON, point it at the production forwarder with `CampaignEscrow.setForwarder`.
