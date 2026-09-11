-- The existing worker profile table predates the current worker portal. A
-- display name is optional in the app and profiles are created from Privy data.
ALTER TABLE "worker_profiles" ALTER COLUMN "display_name" DROP NOT NULL;

-- CreateEnum
CREATE TYPE "PlacementJobStatus" AS ENUM (
    'OPEN',
    'ACCEPTED',
    'AWAITING_CHECK',
    'CHECK_ACCEPTED',
    'VERIFIED',
    'REJECTED',
    'EXPIRED'
);

-- CreateEnum
CREATE TYPE "PlacementJobRole" AS ENUM ('INSTALLER', 'VERIFIER');

-- CreateEnum
CREATE TYPE "LedgerEntryKind" AS ENUM (
    'CAMPAIGN_FUNDING',
    'PLACEMENT_HOLD',
    'HOLD_RELEASE',
    'INSTALLER_PAYOUT',
    'VERIFIER_PAYOUT',
    'REFUND'
);

-- CreateTable
CREATE TABLE "placement_jobs" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "status" "PlacementJobStatus" NOT NULL DEFAULT 'OPEN',
    "installer_fee_minor" BIGINT NOT NULL,
    "verifier_fee_minor" BIGINT NOT NULL,
    "currency" VARCHAR(12) NOT NULL DEFAULT 'USD',
    "installer_id" TEXT,
    "verifier_id" TEXT,
    "accepted_at" TIMESTAMPTZ(3),
    "proof_at" TIMESTAMPTZ(3),
    "check_accepted_at" TIMESTAMPTZ(3),
    "checked_at" TIMESTAMPTZ(3),
    "deadline" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "placement_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement_proofs" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "submitted_by" TEXT NOT NULL,
    "role" "PlacementJobRole" NOT NULL,
    "photo_path" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy_meters" DOUBLE PRECISION,
    "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "job_id" TEXT,
    "worker_id" TEXT,
    "kind" "LedgerEntryKind" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" VARCHAR(12) NOT NULL DEFAULT 'USD',
    "memo" VARCHAR(240),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "placement_jobs_asset_id_key" ON "placement_jobs"("asset_id");

-- CreateIndex
CREATE INDEX "placement_jobs_status_created_at_idx" ON "placement_jobs"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "placement_jobs_campaign_id_idx" ON "placement_jobs"("campaign_id");

-- CreateIndex
CREATE INDEX "placement_jobs_installer_id_idx" ON "placement_jobs"("installer_id");

-- CreateIndex
CREATE INDEX "placement_jobs_verifier_id_idx" ON "placement_jobs"("verifier_id");

-- CreateIndex
CREATE INDEX "placement_jobs_location_id_idx" ON "placement_jobs"("location_id");

-- CreateIndex
CREATE INDEX "placement_proofs_job_id_captured_at_idx" ON "placement_proofs"("job_id", "captured_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_job_id_kind_key" ON "ledger_entries"("job_id", "kind");

-- CreateIndex
CREATE INDEX "ledger_entries_worker_id_created_at_idx" ON "ledger_entries"("worker_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ledger_entries_campaign_id_idx" ON "ledger_entries"("campaign_id");

-- AddForeignKey
ALTER TABLE "placement_jobs" ADD CONSTRAINT "placement_jobs_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_jobs" ADD CONSTRAINT "placement_jobs_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "campaign_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_jobs" ADD CONSTRAINT "placement_jobs_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_jobs" ADD CONSTRAINT "placement_jobs_installer_id_fkey"
  FOREIGN KEY ("installer_id") REFERENCES "worker_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_jobs" ADD CONSTRAINT "placement_jobs_verifier_id_fkey"
  FOREIGN KEY ("verifier_id") REFERENCES "worker_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_proofs" ADD CONSTRAINT "placement_proofs_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "placement_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "placement_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_worker_id_fkey"
  FOREIGN KEY ("worker_id") REFERENCES "worker_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
