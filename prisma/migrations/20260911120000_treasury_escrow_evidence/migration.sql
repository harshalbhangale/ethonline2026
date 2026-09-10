-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ChainTransactionKind" AS ENUM ('TREASURY_TOPUP', 'GAS_TOPUP', 'USDC_APPROVE', 'CAMPAIGN_FUND', 'PLACEMENT_REGISTER', 'WORKERS_ASSIGN', 'PLACEMENT_VERIFIED', 'PLACEMENT_REJECTED', 'CLEANUP_RELEASE', 'CAMPAIGN_REFUND');

-- CreateEnum
CREATE TYPE "ChainTransactionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "FundingRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "VerificationRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "approval_threshold_minor" BIGINT,
ADD COLUMN     "treasury_address" VARCHAR(64),
ADD COLUMN     "treasury_policy_id" VARCHAR(64),
ADD COLUMN     "treasury_wallet_id" VARCHAR(64);

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "escrow_address" VARCHAR(42),
ADD COLUMN     "escrow_campaign_id" VARCHAR(66),
ADD COLUMN     "funded_amount_minor" BIGINT;

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "role" "JobRole" NOT NULL,
    "worker_user_id" TEXT NOT NULL,
    "scanned_short_code" VARCHAR(32) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy_meters" DOUBLE PRECISION,
    "captured_at" TIMESTAMPTZ(3) NOT NULL,
    "challenge_symbol" VARCHAR(16) NOT NULL,
    "challenge_response" VARCHAR(16) NOT NULL,
    "challenge_issued_at" TIMESTAMPTZ(3) NOT NULL,
    "challenge_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "media_hash" VARCHAR(66) NOT NULL,
    "media_path" TEXT,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'SUBMITTED',
    "rejection_reason" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "campaign_id" TEXT,
    "placement_id" TEXT,
    "kind" "ChainTransactionKind" NOT NULL,
    "status" "ChainTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "chain_id" INTEGER NOT NULL,
    "tx_hash" VARCHAR(66) NOT NULL,
    "log_index" INTEGER NOT NULL DEFAULT -1,
    "from_address" VARCHAR(42),
    "to_address" VARCHAR(42),
    "amount" VARCHAR(80),
    "via_privy" BOOLEAN NOT NULL DEFAULT false,
    "block_number" BIGINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chain_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funding_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "status" "FundingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by" TEXT NOT NULL,
    "decided_by" TEXT,
    "decided_at" TIMESTAMPTZ(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "funding_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_runs" (
    "id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "status" "VerificationRunStatus" NOT NULL DEFAULT 'QUEUED',
    "mode" VARCHAR(24) NOT NULL,
    "approved" BOOLEAN,
    "reasons" TEXT[],
    "evidence_hash" VARCHAR(66),
    "tx_hash" VARCHAR(66),
    "log" TEXT,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidence_placement_id_role_idx" ON "evidence"("placement_id", "role");

-- CreateIndex
CREATE INDEX "evidence_media_hash_idx" ON "evidence"("media_hash");

-- CreateIndex
CREATE INDEX "chain_transactions_organization_id_created_at_idx" ON "chain_transactions"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "chain_transactions_campaign_id_idx" ON "chain_transactions"("campaign_id");

-- CreateIndex
CREATE INDEX "chain_transactions_placement_id_idx" ON "chain_transactions"("placement_id");

-- CreateIndex
CREATE UNIQUE INDEX "chain_transactions_tx_hash_log_index_kind_key" ON "chain_transactions"("tx_hash", "log_index", "kind");

-- CreateIndex
CREATE INDEX "funding_requests_organization_id_status_idx" ON "funding_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "funding_requests_campaign_id_idx" ON "funding_requests"("campaign_id");

-- CreateIndex
CREATE INDEX "verification_runs_placement_id_created_at_idx" ON "verification_runs"("placement_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_treasury_wallet_id_key" ON "organizations"("treasury_wallet_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_escrow_campaign_id_key" ON "campaigns"("escrow_campaign_id");

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_worker_user_id_fkey" FOREIGN KEY ("worker_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_transactions" ADD CONSTRAINT "chain_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_transactions" ADD CONSTRAINT "chain_transactions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_transactions" ADD CONSTRAINT "chain_transactions_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_requests" ADD CONSTRAINT "funding_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_requests" ADD CONSTRAINT "funding_requests_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_requests" ADD CONSTRAINT "funding_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_requests" ADD CONSTRAINT "funding_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

