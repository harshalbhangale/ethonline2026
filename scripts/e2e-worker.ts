/**
 * End-to-end run of the Worker PWA flow on Sepolia, through the same services
 * its API routes call.
 *
 *   1. A brand funds a one-placement campaign from its Privy treasury.
 *   2. Worker A sees the job with an approximate location and accepts it.
 *   3. A's live trail reaches the venue; "Stick & verify" unlocks.
 *   4. A submits the poster code and a photo; bad codes are refused.
 *   5. The Chainlink CRE confidential workflow judges the trail, code and
 *      photo, and the escrow pays A both rewards.
 *   With E2E_SPOT_CHECK=1 the enclave draws a spot check instead: worker B
 *   confirms independently before anyone is paid.
 *
 * Requires the app running at E2E_APP_URL (default http://127.0.0.1:3100) for
 * CRE callbacks, the CRE CLI, Supabase storage and a funded operator key.
 *
 *   node scripts/run-ts.cjs scripts/e2e-worker.ts
 */
import { randomBytes } from "node:crypto";
import { OrganizationRole, PlacementStatus } from "@/generated/prisma/client";
import type { BrandContext } from "@/lib/auth/require-brand";
import type { WorkerContext } from "@/lib/auth/require-worker";
import { explorerTxUrl } from "@/lib/chain/explorer";
import { getPrismaClient } from "@/lib/database/prisma";
import { fundCampaign } from "@/lib/funding/service";
import { ApiError } from "@/lib/http/api-error";
import {
  acceptCheck,
  acceptPlacement,
  confirmPlacement,
  ensurePayoutWallet,
  getTask,
  getWallet,
  listCheckableTasks,
  listPlaceableTasks,
  recordPing,
  submitInstallProof,
} from "@/lib/jobs/worker-view";
import { createCampaignQuote } from "@/lib/quotes/service";
import { createProofUploadUrl } from "@/lib/storage/proofs";
import { getTreasury, topUpTreasury } from "@/lib/treasury/service";

const APP_URL = process.env.E2E_APP_URL ?? "http://127.0.0.1:3100";
const LOCATION = "cpt-waterfront-visitor-board";
/** E2E_SPOT_CHECK=1 forces a random spot check by a second worker. */
const SPOT_CHECK = process.env.E2E_SPOT_CHECK === "1";
process.env.STICKERBOMB_SPOT_CHECK_PERCENT = SPOT_CHECK ? "100" : "0";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const prisma = getPrismaClient();
let failures = 0;

function log(...parts: unknown[]) {
  console.log(new Date().toISOString().slice(11, 19), ...parts);
}

function check(name: string, ok: boolean, detail?: unknown) {
  log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  -> ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

async function outcome(promise: Promise<unknown>) {
  try {
    await promise;
    return "OK";
  } catch (error) {
    return error instanceof ApiError ? `${error.status} ${error.code}` : `THREW ${(error as Error).message}`;
  }
}

async function brand(): Promise<BrandContext> {
  const user = await prisma.user.upsert({
    where: { privyUserId: "e2e:brand" },
    update: {},
    create: { privyUserId: "e2e:brand" },
  });
  const organization = await prisma.organization.upsert({
    where: { slug: "stickerbomb-e2e-demo" },
    update: {},
    create: { name: "StickerBomb E2E Demo", slug: "stickerbomb-e2e-demo", createdById: user.id },
  });
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
    update: {},
    create: { organizationId: organization.id, userId: user.id, role: OrganizationRole.BRAND },
  });
  return {
    userId: user.id,
    privyUserId: user.privyUserId,
    organizationId: organization.id,
    organizationName: organization.name,
    role: OrganizationRole.BRAND,
  };
}

async function worker(privyUserId: string): Promise<WorkerContext> {
  const user = await prisma.user.upsert({ where: { privyUserId }, update: {}, create: { privyUserId } });
  await prisma.workerProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
  await ensurePayoutWallet(user.id);
  return { userId: user.id, privyUserId, displayName: privyUserId };
}

/** Uploads a unique "photo" exactly as the phone does: straight to storage. */
async function uploadPhoto(placementId: string, workerCtx: WorkerContext) {
  const { signedUrl, path } = await createProofUploadUrl(placementId, workerCtx.userId, "image/png");
  const response = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: Buffer.concat([PNG_SIGNATURE, randomBytes(256)]),
  });
  if (!response.ok) throw new Error(`photo upload failed: ${response.status}`);
  return path;
}

async function waitForStatus(placementId: string, statuses: PlacementStatus[]) {
  const started = Date.now();
  while (Date.now() - started < 8 * 60_000) {
    const placement = await prisma.placement.findUniqueOrThrow({ where: { id: placementId } });
    if (statuses.includes(placement.status)) return placement;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Timed out waiting for ${statuses.join("/")}.`);
}

async function waitForSettlement(placementId: string) {
  const started = Date.now();
  while (Date.now() - started < 8 * 60_000) {
    const placement = await prisma.placement.findUniqueOrThrow({ where: { id: placementId } });
    const run = await prisma.verificationRun.findFirst({ where: { placementId }, orderBy: { createdAt: "desc" } });
    if (run?.status === "FAILED") {
      console.log(run.log?.slice(-3_000));
      throw new Error("Confidential verification run failed.");
    }
    if (placement.status === PlacementStatus.VERIFIED || placement.status === PlacementStatus.NEEDS_RECAPTURE) {
      return { status: placement.status, run };
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("Timed out waiting for confidential verification.");
}

async function main() {
  const context = await brand();
  const location = await prisma.location.findUniqueOrThrow({ where: { slug: LOCATION } });
  // Earlier runs hold this venue's capacity; end them, as a brand would.
  await prisma.campaign.updateMany({
    where: {
      organizationId: context.organizationId,
      status: { in: ["FUNDED", "ASSETS_READY", "DEPLOYING", "VERIFYING", "LIVE"] },
    },
    data: { status: "COMPLETE" },
  });

  const campaign = await prisma.campaign.create({
    data: {
      organizationId: context.organizationId,
      createdById: context.userId,
      name: `Worker E2E ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      briefText: "One QR poster at the V&A Waterfront visitor board.",
      placementCount: 1,
      budgetLimitMinor: BigInt(10_000),
      destinationUrl: "https://example.com/stickerbomb-worker-e2e",
      deadline: new Date(Date.now() + 7 * 86_400_000),
      countryCode: "ZA",
      countryName: "South Africa",
      city: "Cape Town",
      centerLatitude: location.latitude,
      centerLongitude: location.longitude,
      radiusMeters: 3_000,
      locationStrategy: "AUTO_APPROVED",
      areaLabel: "3 km around Cape Town, South Africa",
      wizardStep: "REVIEW",
    },
  });
  await prisma.campaignLocation.create({
    data: { campaignId: campaign.id, locationId: location.id, source: "SYSTEM" },
  });

  const quote = await createCampaignQuote(context, campaign.id);
  let treasury = await getTreasury(context);
  if (BigInt(treasury.balances?.tokenUnits ?? "0") < BigInt(quote.totalMinor) * BigInt(10_000)) {
    treasury = await topUpTreasury(context);
  }
  const funding = await fundCampaign(context, campaign.id, APP_URL);
  if (funding.status !== "FUNDED" || !funding.txHash) throw new Error("Funding did not complete.");
  log("funded", quote.total, explorerTxUrl(funding.txHash));

  const placement = await prisma.placement.findFirstOrThrow({ where: { campaignId: campaign.id } });
  const A = await worker("e2e:worker-a");
  const B = await worker("e2e:worker-b");
  const near = () => ({
    latitude: location.latitude + (Math.random() - 0.5) * 0.0002,
    longitude: location.longitude + (Math.random() - 0.5) * 0.0002,
  });

  const open = (await listPlaceableTasks(A)).find((task) => task.id === placement.id);
  check("worker A sees the open job", open?.status === "OPEN", open?.status);
  check(
    "open job hides the exact surface",
    Boolean(open) && open!.placementInstructions === null && !open!.venueName.includes(location.venueName),
    open && { venue: open.venueName, instructions: open.placementInstructions },
  );

  const accepted = await acceptPlacement(A, placement.id);
  check("accepting reveals the exact surface", accepted.placementInstructions === location.placementInstructions && accepted.status === "ACCEPTED", accepted.status);
  check("placement is self-verified by default", accepted.verificationMode === "SELF", accepted.verificationMode);

  // A walks to the venue: a trail approaching over ~2 minutes, then on site.
  const job = await prisma.job.findFirstOrThrow({ where: { placementId: placement.id, role: "INSTALLER" } });
  const now = Date.now();
  await prisma.locationPing.createMany({
    data: Array.from({ length: 12 }, (_, index) => {
      const remaining = Math.max(0, 7 - index) * 0.0006;
      return {
        placementId: placement.id,
        jobId: job.id,
        workerUserId: A.userId,
        latitude: location.latitude + remaining,
        longitude: location.longitude,
        accuracyMeters: 8,
        recordedAt: new Date(now - (12 - index) * 10_000),
      };
    }),
  });
  const ping = await recordPing(A, placement.id, { ...near(), accuracyMeters: 8 });
  check("live ping: on site long enough to unlock", ping.insideFence && ping.readyToVerify, ping);

  const code = (
    await prisma.placement.findUniqueOrThrow({
      where: { id: placement.id },
      select: { asset: { select: { shortCode: true } } },
    })
  ).asset.shortCode;
  check("proof without a photo is refused", (await outcome(submitInstallProof(A, placement.id, { ...near(), scannedShortCode: code }, APP_URL))) === "422 PHOTO_REQUIRED");
  const photoA1 = await uploadPhoto(placement.id, A);
  check("proof without the poster code is refused", (await outcome(submitInstallProof(A, placement.id, { photoPath: photoA1, ...near() }, APP_URL))) === "422 POSTER_CODE_REQUIRED");
  check("a different poster's code is refused", (await outcome(submitInstallProof(A, placement.id, { photoPath: photoA1, ...near(), scannedShortCode: "WRONG1" }, APP_URL))) === "422 WRONG_POSTER");
  check("a photo from far away is refused", (await outcome(submitInstallProof(A, placement.id, { photoPath: photoA1, latitude: location.latitude + 0.02, longitude: location.longitude, scannedShortCode: code }, APP_URL))) === "422 OUTSIDE_GEOFENCE");

  const submitted = await submitInstallProof(A, placement.id, { photoPath: photoA1, ...near(), accuracyMeters: 8, scannedShortCode: code.toLowerCase() }, APP_URL);
  check("stick & verify: straight to the confidential check", submitted.status === "IN_REVIEW", submitted.status);

  if (SPOT_CHECK) {
    const drawn = await waitForStatus(placement.id, [PlacementStatus.AWAITING_VERIFIER]);
    check("Chainlink CRE drew a spot check; nothing paid yet", drawn.status === PlacementStatus.AWAITING_VERIFIER && drawn.spotCheckRequired);
    check("installer cannot take their own spot check", (await outcome(acceptCheck(A, placement.id))) === "403 SELF_VERIFICATION");
    await acceptCheck(B, placement.id);
    const photoB = await uploadPhoto(placement.id, B);
    const confirmed = await confirmPlacement(B, placement.id, { photoPath: photoB, ...near(), scannedShortCode: code }, APP_URL);
    check("spot check confirmed; verification running again", confirmed.status === "IN_REVIEW", confirmed.status);
  }

  const settled = await waitForSettlement(placement.id);
  check("Chainlink CRE approved and escrow settled", settled.status === PlacementStatus.VERIFIED, settled.run?.reasons);
  if (settled.run?.txHash) log("report tx", explorerTxUrl(settled.run.txHash));

  const [walletA, walletB] = await Promise.all([getWallet(A), getWallet(B)]);
  check("installer earned 6.00", walletA.history.some((entry) => entry.kind === "INSTALLER_PAYOUT" && entry.amountMinor === "600"), walletA.history);
  if (SPOT_CHECK) {
    check("spot checker earned 4.00", walletB.history.some((entry) => entry.kind === "VERIFIER_PAYOUT" && entry.amountMinor === "400"), walletB.history);
  } else {
    check("self-verifier also earned the 4.00 check fee", walletA.history.some((entry) => entry.kind === "VERIFIER_PAYOUT" && entry.amountMinor === "400"), walletA.history);
  }
  log("payout wallets", walletA.payoutAddress, walletB.payoutAddress);

  log(failures ? `${failures} FAILED` : "WORKER E2E COMPLETE", `${APP_URL}/brand/campaigns/${campaign.id}`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error("WORKER E2E FAILED:", error);
  process.exit(1);
});
