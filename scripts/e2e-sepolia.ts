/**
 * End-to-end run of the StickerBomb brand flow on Sepolia.
 *
 *   1. A brand organization gets a Privy treasury wallet with a Privy policy.
 *   2. The treasury funds a two-placement campaign into CampaignEscrow.
 *   3. Placements are registered in escrow and installer jobs open.
 *   4. Placement 1: installer and an independent verifier submit proof; the
 *      Chainlink CRE confidential workflow approves it and escrow pays both.
 *   5. Placement 2: the installer's proof comes from the wrong place; the
 *      enclave rejects it, payment stays locked, the proof is recaptured and
 *      then approved.
 *
 * Requires the app to be running (CRE calls back into /api/cre) at E2E_APP_URL
 * (default http://127.0.0.1:3100), NEXT_PUBLIC_DEMO_MODE=true, the CRE CLI, a
 * funded operator key and Privy credentials in .env.
 *
 *   node scripts/run-ts.cjs scripts/e2e-sepolia.ts
 */
import { OrganizationRole, PlacementStatus } from "@/generated/prisma/client";
import type { BrandContext } from "@/lib/auth/require-brand";
import { erc20Abi } from "@/lib/chain/abis";
import { getPublicClient } from "@/lib/chain/client";
import { getChainConfig } from "@/lib/chain/config";
import { explorerTxUrl } from "@/lib/chain/explorer";
import { formatTokenUnits } from "@/lib/chain/units";
import { getPrismaClient } from "@/lib/database/prisma";
import { runDemoAction } from "@/lib/demo/service";
import { ensureDemoWorkers } from "@/lib/demo/workers";
import { fundCampaign } from "@/lib/funding/service";
import { getCampaignEscrow } from "@/lib/onchain/placements";
import { listCampaignPlacements } from "@/lib/placements/service";
import { createCampaignQuote } from "@/lib/quotes/service";
import { getTreasury, topUpTreasury } from "@/lib/treasury/service";

const APP_URL = process.env.E2E_APP_URL ?? "http://127.0.0.1:3100";
const LOCATIONS = ["cpt-city-bowl-coworking", "cpt-observatory-student-board"];
const VERIFY_TIMEOUT_MS = 8 * 60_000;

const prisma = getPrismaClient();

function log(...parts: unknown[]) {
  console.log(new Date().toISOString().slice(11, 19), ...parts);
}

async function ensureBrand(): Promise<BrandContext> {
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

async function createCampaign(context: BrandContext) {
  const locations = await prisma.location.findMany({ where: { slug: { in: LOCATIONS } } });
  if (locations.length !== LOCATIONS.length) throw new Error("Seeded Cape Town locations are missing.");
  const centre = locations[0];

  const campaign = await prisma.campaign.create({
    data: {
      organizationId: context.organizationId,
      createdById: context.userId,
      name: `E2E drop ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      briefText: "Two QR posters around the Cape Town city bowl, sending scans to our waitlist.",
      placementCount: LOCATIONS.length,
      budgetLimitMinor: BigInt(10_000),
      destinationUrl: "https://example.com/stickerbomb-waitlist",
      deadline: new Date(Date.now() + 7 * 86_400_000),
      countryCode: "ZA",
      countryName: "South Africa",
      city: "Cape Town",
      centerLatitude: centre.latitude,
      centerLongitude: centre.longitude,
      radiusMeters: 6_000,
      locationStrategy: "AUTO_APPROVED",
      areaLabel: "6 km around Cape Town, South Africa",
      wizardStep: "REVIEW",
    },
  });

  await prisma.campaignLocation.createMany({
    data: locations.map((location) => ({
      campaignId: campaign.id,
      locationId: location.id,
      source: "SYSTEM" as const,
    })),
  });

  return campaign;
}

async function placementStatus(placementId: string) {
  const placement = await prisma.placement.findUniqueOrThrow({ where: { id: placementId } });
  return placement.status;
}

async function advance(context: BrandContext, campaignId: string, placementId: string, fraudulent = false) {
  const result = await runDemoAction(
    context,
    campaignId,
    { action: "advance-placement", placementId, fraudulent },
    APP_URL,
  );
  log("  ›", result.message);
}

async function waitForVerdict(placementId: string) {
  const started = Date.now();
  while (Date.now() - started < VERIFY_TIMEOUT_MS) {
    const status = await placementStatus(placementId);
    const run = await prisma.verificationRun.findFirst({
      where: { placementId },
      orderBy: { createdAt: "desc" },
    });

    if (run?.status === "FAILED") {
      console.log(run.log?.slice(-4_000));
      throw new Error("Confidential verification run failed.");
    }
    if (
      run?.status === "SUCCEEDED" &&
      (status === PlacementStatus.VERIFIED || status === PlacementStatus.NEEDS_RECAPTURE)
    ) {
      return { status, run };
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("Timed out waiting for confidential verification.");
}

const stepDescriptions: Partial<Record<PlacementStatus, string>> = {
  AWAITING_INSTALL: "sending demo installer",
  INSTALLING: "installer proof",
  AWAITING_VERIFIER: "sending independent verifier",
  VERIFYING: "verifier proof and onchain worker assignment",
  READY_FOR_FINAL_VERIFICATION: "Chainlink CRE confidential verification",
  NEEDS_RECAPTURE: "recapturing proof at the approved surface",
};

/**
 * Advances a placement from whatever state it is in until escrow has paid it.
 * Resumable: rerunning after a failure continues from the current state.
 */
async function runPlacement(
  context: BrandContext,
  campaignId: string,
  placementId: string,
  label: string,
  fraudulent: boolean,
) {
  let usedFraud = false;

  for (let step = 0; step < 14; step++) {
    const status = await placementStatus(placementId);
    if (status === PlacementStatus.VERIFIED) {
      log(`${label}: verified and paid`);
      return;
    }

    const fraud = fraudulent && !usedFraud && status === PlacementStatus.INSTALLING;
    if (fraud) usedFraud = true;
    log(`${label}: ${stepDescriptions[status] ?? status}${fraud ? " (from the wrong place)" : ""}`);
    await advance(context, campaignId, placementId, fraud);

    if (status === PlacementStatus.READY_FOR_FINAL_VERIFICATION) {
      const verdict = await waitForVerdict(placementId);
      log(`${label}: verdict approved=${verdict.run.approved} reasons=${verdict.run.reasons.join(",") || "none"}`);
      if (verdict.run.txHash) log(`${label}: report tx ${explorerTxUrl(verdict.run.txHash)}`);
    }
  }

  throw new Error(`${label} did not reach VERIFIED.`);
}

async function main() {
  const config = getChainConfig();
  const context = await ensureBrand();
  log("brand organization", context.organizationId);

  let treasury = await getTreasury(context);
  if (!treasury.wallet) throw new Error(`Treasury unavailable: ${treasury.walletError}`);
  log("Privy treasury", treasury.wallet.address, "policy", treasury.policy.id);

  // E2E_CAMPAIGN_ID resumes an already-funded campaign instead of creating one.
  const resumeId = process.env.E2E_CAMPAIGN_ID?.trim();
  const campaign = resumeId
    ? await prisma.campaign.findFirstOrThrow({
        where: { id: resumeId, organizationId: context.organizationId },
      })
    : await createCampaign(context);

  if (campaign.fundedAt) {
    log("resuming funded campaign", campaign.id, explorerTxUrl(campaign.fundingReference ?? ""));
  } else {
    const quote = await createCampaignQuote(context, campaign.id);
    log("campaign", campaign.id, "quote", quote.total, quote.currency);

    const neededUnits = BigInt(quote.totalMinor) * BigInt(10_000);
    if (BigInt(treasury.balances?.tokenUnits ?? "0") < neededUnits) {
      log("topping up treasury with test stablecoin");
      treasury = await topUpTreasury(context);
    }
    log("treasury balance", treasury.balances?.token, treasury.token?.symbol);

    log("funding campaign from the Privy treasury into escrow");
    const funding = await fundCampaign(context, campaign.id, APP_URL);
    if (funding.status !== "FUNDED" || !funding.txHash) throw new Error("Funding did not complete.");
    log("funded", explorerTxUrl(funding.txHash));
  }

  const { placements } = await listCampaignPlacements(context, campaign.id);
  log("placements", placements.map((p) => `${p.location.venueName}:${p.onchain.placementKey ? "registered" : "unregistered"}`).join(", "));

  await runPlacement(context, campaign.id, placements[0].id, "placement 1", false);
  await runPlacement(context, campaign.id, placements[1].id, "placement 2", true);

  const escrow = await getCampaignEscrow(context, campaign.id);
  log("escrow", JSON.stringify({ funded: escrow.funded, paidOut: escrow.paidOut, held: escrow.held, cleanupReserveLocked: escrow.cleanupReserveLocked, available: escrow.available }));

  const workers = await ensureDemoWorkers();
  for (const [role, worker] of Object.entries(workers)) {
    const balance = await getPublicClient().readContract({
      address: config.usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [worker.walletAddress as `0x${string}`],
    });
    log(`${role} wallet ${worker.walletAddress} holds ${formatTokenUnits(balance)} ${treasury.token?.symbol}`);
  }

  log("E2E COMPLETE", `${APP_URL}/brand/campaigns/${campaign.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("E2E FAILED:", error);
    process.exit(1);
  });
