/**
 * Removes the Jalgaon dummy test job created by add-jalgaon-test-job.ts.
 * Refuses to touch anything if the placement has already gone anywhere near
 * settlement, since real Sepolia funds are involved.
 *
 *   node scripts/run-ts.cjs scripts/remove-jalgaon-test-job.ts <campaignId> <locationId>
 */
import { getPrismaClient } from "@/lib/database/prisma";

async function main() {
  const [campaignId, locationId] = process.argv.slice(2);
  if (!campaignId || !locationId) {
    console.error("Usage: remove-jalgaon-test-job.ts <campaignId> <locationId>");
    process.exit(1);
  }

  const prisma = getPrismaClient();
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { placements: { include: { jobs: true } } },
  });

  const unsafe = campaign.placements.some((p) =>
    p.jobs.some((j) => !["OPEN", "ACCEPTED"].includes(j.status)),
  );
  if (unsafe) {
    console.error(
      "A job on this test campaign has proof submitted or is settled. Not deleting automatically — check it by hand.",
    );
    process.exit(1);
  }

  await prisma.$transaction([
    prisma.job.deleteMany({ where: { campaignId } }),
    prisma.placement.deleteMany({ where: { campaignId } }),
    prisma.campaignAsset.deleteMany({ where: { campaignId } }),
    prisma.campaignLocation.deleteMany({ where: { campaignId } }),
    prisma.campaignArea.deleteMany({ where: { campaignId } }),
    prisma.chainTransaction.deleteMany({ where: { campaignId } }),
    prisma.campaignQuote.deleteMany({ where: { campaignId } }),
    prisma.campaign.delete({ where: { id: campaignId } }),
  ]);
  await prisma.location.delete({ where: { id: locationId } });

  console.log("Removed test campaign", campaignId, "and location", locationId);
  console.log("The escrow keeps its funding-transaction history on Sepolia; nothing to undo there.");
  process.exit(0);
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exit(1);
});
