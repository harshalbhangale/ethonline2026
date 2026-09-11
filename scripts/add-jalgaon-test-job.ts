/**
 * One-off: a dummy gig job in Jalgaon, Maharashtra, for testing the worker
 * portal. Funds a real 1-placement campaign from the E2E demo org's Sepolia
 * treasury, so it exercises the exact same path a real job takes.
 *
 *   node scripts/run-ts.cjs scripts/add-jalgaon-test-job.ts
 *
 * Prints the location id and campaign id so the companion cleanup script
 * can remove exactly this, and nothing else.
 */
import { LocationPermissionStatus } from "@/generated/prisma/client";
import type { BrandContext } from "@/lib/auth/require-brand";
import { createCampaign, updateCampaign } from "@/lib/campaigns/service";
import { getPrismaClient } from "@/lib/database/prisma";
import { fundCampaign } from "@/lib/funding/service";
import { saveCampaignPlacementPlan } from "@/lib/locations/service";
import { createCampaignQuote } from "@/lib/quotes/service";

const APP_URL = process.env.E2E_APP_URL ?? "https://ethonline2026.vercel.app";
const ORG_ID = "cmtvyol4l00019uitbnetkeqy"; // StickerBomb E2E Demo
// Jalgaon city centre.
const JALGAON = { latitude: 21.0077, longitude: 75.5626 };

async function main() {
  const prisma = getPrismaClient();
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ORG_ID } });
  const creator = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: ORG_ID },
    include: { user: true },
  });
  const context: BrandContext = {
    userId: creator.userId,
    privyUserId: creator.user.privyUserId,
    organizationId: ORG_ID,
    organizationName: org.name,
    role: creator.role,
  };

  const location = await prisma.location.create({
    data: {
      venueName: "Jalgaon Bus Stand noticeboard",
      slug: `jal-bus-stand-test-${Date.now()}`,
      city: "Jalgaon",
      countryCode: "IN",
      countryName: "India",
      latitude: JALGAON.latitude,
      longitude: JALGAON.longitude,
      placementInstructions: "Test location — remove after the worker-portal test.",
      permissionStatus: LocationPermissionStatus.APPROVED,
      maxActiveCampaigns: 3,
    },
  });
  console.log("location", location.id, location.slug);

  const campaign = await createCampaign(context, {
    name: "Jalgaon worker-portal test",
    briefText: "Dummy job to test the worker portal in Jalgaon, Maharashtra. Delete after testing.",
    currency: "USD",
    placementCount: 1,
    budgetLimit: BigInt(1_000), // $10.00 in cents
    destinationUrl: "https://example.com/stickerbomb-jalgaon-test",
    deadline: new Date(Date.now() + 7 * 86_400_000),
  });
  console.log("campaign", campaign.id);

  // Mirrors what the wizard's location step saves before the area step runs.
  await updateCampaign(context, campaign.id, {
    city: "Jalgaon",
    countryCode: "IN",
    countryName: "India",
    centerLatitude: JALGAON.latitude,
    centerLongitude: JALGAON.longitude,
    radiusMeters: 3_000,
  });

  await saveCampaignPlacementPlan(context, campaign.id, {
    areas: [{ label: "Jalgaon", latitude: JALGAON.latitude, longitude: JALGAON.longitude, radiusMetres: 3_000 }],
    strategy: "AUTO_APPROVED",
    locationIds: [],
  });

  await createCampaignQuote(context, campaign.id);
  const funded = await fundCampaign(context, campaign.id, APP_URL);
  console.log("funded", funded.status, "mocked" in funded ? funded.mocked : undefined);

  console.log("\nDone. A worker job should now be open in Find work.");
  console.log("To remove it: node scripts/run-ts.cjs scripts/remove-jalgaon-test-job.ts", campaign.id, location.id);
  process.exit(0);
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exit(1);
});
