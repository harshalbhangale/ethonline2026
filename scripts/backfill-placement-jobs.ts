/**
 * Dispatches worker jobs for campaigns that were funded before job dispatch
 * existed.
 *
 * The funding path now creates one PlacementJob per located asset inside the
 * funding transaction, but campaigns funded earlier never got that far: their
 * assets are READY and bound to venues while `placement_jobs` is empty, and
 * `fundCampaign` refuses to re-run a campaign that already has `fundedAt`.
 *
 * This reuses `dispatchJobsForCampaign` so fees and the PLACEMENT_HOLD entries
 * are identical to what a fresh funding would have written. It also replays the
 * CAMPAIGN_FUNDING entry from the approved quote, because the holds are negative
 * against the campaign and would otherwise drive its escrow balance below zero.
 *
 * Safe to re-run: jobs are unique per asset, `(jobId, kind)` is unique in the
 * ledger, and the funding entry is checked for explicitly because its null
 * `jobId` cannot collide on that index.
 *
 * Usage: npm run db:backfill-jobs -- [--dry-run]
 */
import { LedgerEntryKind } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/database/prisma";
import { dispatchJobsForCampaign } from "@/lib/jobs/dispatch";
import { recordEntry } from "@/lib/ledger/service";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const prisma = getPrismaClient();

  const campaigns = await prisma.campaign.findMany({
    where: { fundedAt: { not: null } },
    orderBy: { fundedAt: "asc" },
    select: {
      id: true,
      name: true,
      currency: true,
      fundedAt: true,
      fundingReference: true,
      _count: { select: { placementJobs: true } },
      assets: {
        where: { locationId: { not: null } },
        select: { id: true },
      },
      quotes: {
        where: { status: "APPROVED" },
        orderBy: { version: "desc" },
        take: 1,
        select: { totalMinor: true, currency: true },
      },
    },
  });

  console.log(`Found ${campaigns.length} funded campaign(s).\n`);

  let jobsCreated = 0;

  for (const campaign of campaigns) {
    console.log(`${campaign.name} (${campaign.id})`);
    console.log(
      `  assets with a venue: ${campaign.assets.length}, existing jobs: ${campaign._count.placementJobs}`,
    );

    if (campaign.assets.length === 0) {
      console.log("  skipped: no assets are bound to a venue\n");
      continue;
    }

    if (campaign._count.placementJobs >= campaign.assets.length) {
      console.log("  skipped: already dispatched\n");
      continue;
    }

    const quote = campaign.quotes[0];

    if (!quote) {
      console.log("  skipped: no approved quote to fund against\n");
      continue;
    }

    if (dryRun) {
      console.log(
        `  would create ${campaign.assets.length - campaign._count.placementJobs} job(s)\n`,
      );
      continue;
    }

    const created = await prisma.$transaction(async (transaction) => {
      // The brand's money has to land before the per-job holds draw against it.
      const funding = await transaction.ledgerEntry.findFirst({
        where: {
          campaignId: campaign.id,
          kind: LedgerEntryKind.CAMPAIGN_FUNDING,
        },
      });

      if (!funding) {
        await recordEntry(transaction, {
          kind: LedgerEntryKind.CAMPAIGN_FUNDING,
          amountMinor: quote.totalMinor,
          campaignId: campaign.id,
          currency: quote.currency,
          memo: campaign.fundingReference ?? "backfilled funding",
        });
        console.log(`  recorded CAMPAIGN_FUNDING of ${quote.totalMinor}`);
      }

      return dispatchJobsForCampaign(transaction, campaign.id);
    });

    jobsCreated += created.length;
    console.log(`  dispatched: ${created.length} job(s) now exist\n`);
  }

  console.log(
    dryRun
      ? "Dry run complete. No rows were written."
      : `Done. ${jobsCreated} job row(s) accounted for.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrismaClient().$disconnect();
  });
