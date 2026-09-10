import {
  LedgerEntryKind,
  PlacementJobStatus,
  type Prisma,
} from "@/generated/prisma/client";
import { perPlacementMinor } from "@/lib/campaigns/pricing";
import { recordEntry } from "@/lib/ledger/service";

const installerFeeMinor = BigInt(perPlacementMinor.installation);
const verifierFeeMinor = BigInt(perPlacementMinor.verification);

/**
 * Creates the worker jobs for a funded campaign.
 *
 * One job per generated asset, because an asset is one printed poster bound to
 * one venue. Fees come from the same rate card that produced the brand's quote,
 * so what the brand paid for installation and verification is exactly what the
 * workers are owed.
 *
 * Called inside the funding transaction: a job must never exist for money that
 * was not held, and held money must never exist without a job to spend it on.
 */
export async function dispatchJobsForCampaign(
  transaction: Prisma.TransactionClient,
  campaignId: string,
) {
  const assets = await transaction.campaignAsset.findMany({
    where: { campaignId, locationId: { not: null } },
    orderBy: { sequence: "asc" },
  });

  const campaign = await transaction.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    select: { currency: true, deadline: true },
  });

  const created = [];

  for (const asset of assets) {
    if (!asset.locationId) continue;

    // An asset already dispatched keeps its job; funding is not re-runnable but
    // this keeps the operation safe to retry.
    const existing = await transaction.placementJob.findUnique({
      where: { assetId: asset.id },
    });

    if (existing) {
      created.push(existing);
      continue;
    }

    const job = await transaction.placementJob.create({
      data: {
        campaignId,
        assetId: asset.id,
        locationId: asset.locationId,
        status: PlacementJobStatus.OPEN,
        installerFeeMinor,
        verifierFeeMinor,
        currency: campaign.currency,
        deadline: campaign.deadline,
      },
    });

    await recordEntry(transaction, {
      kind: LedgerEntryKind.PLACEMENT_HOLD,
      amountMinor: -(installerFeeMinor + verifierFeeMinor),
      campaignId,
      jobId: job.id,
      currency: campaign.currency,
      memo: "Reserved for placement and check",
    });

    created.push(job);
  }

  return created;
}
