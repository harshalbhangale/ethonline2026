-- CreateEnum
CREATE TYPE "JobRole" AS ENUM ('INSTALLER', 'VERIFIER', 'CLEANUP');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('OPEN', 'RESERVED', 'ACCEPTED', 'IN_PROGRESS', 'PROOF_SUBMITTED', 'ACCEPTED_PROOF', 'REJECTED_PROOF', 'PAID', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlacementStatus" AS ENUM ('AWAITING_INSTALL', 'INSTALLING', 'INSTALL_SUBMITTED', 'AWAITING_VERIFIER', 'VERIFYING', 'READY_FOR_FINAL_VERIFICATION', 'VERIFIED', 'NEEDS_RECAPTURE', 'REMOVING', 'REMOVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "placements" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "status" "PlacementStatus" NOT NULL DEFAULT 'AWAITING_INSTALL',
    "installer_user_id" TEXT,
    "verifier_user_id" TEXT,
    "onchain_placement_id" VARCHAR(80),
    "installed_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "removed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "role" "JobRole" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'OPEN',
    "reward_minor" BIGINT NOT NULL,
    "currency" VARCHAR(12) NOT NULL DEFAULT 'USD',
    "worker_user_id" TEXT,
    "reserved_until" TIMESTAMPTZ(3),
    "accepted_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "placements_asset_id_key" ON "placements"("asset_id");

-- CreateIndex
CREATE INDEX "placements_campaign_id_idx" ON "placements"("campaign_id");

-- CreateIndex
CREATE INDEX "placements_location_id_idx" ON "placements"("location_id");

-- CreateIndex
CREATE INDEX "placements_status_idx" ON "placements"("status");

-- CreateIndex
CREATE INDEX "jobs_campaign_id_idx" ON "jobs"("campaign_id");

-- CreateIndex
CREATE INDEX "jobs_status_role_idx" ON "jobs"("status", "role");

-- CreateIndex
CREATE INDEX "jobs_worker_user_id_status_idx" ON "jobs"("worker_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_placement_id_role_key" ON "jobs"("placement_id", "role");

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "campaign_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_installer_user_id_fkey" FOREIGN KEY ("installer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placements" ADD CONSTRAINT "placements_verifier_user_id_fkey" FOREIGN KEY ("verifier_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_worker_user_id_fkey" FOREIGN KEY ("worker_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The installer and verifier of a placement must be different people. The job
-- service checks this too; the constraint makes it impossible to bypass.
ALTER TABLE "placements" ADD CONSTRAINT "placements_independent_verifier_check"
  CHECK ("installer_user_id" IS NULL OR "verifier_user_id" IS NULL OR "installer_user_id" <> "verifier_user_id");

-- Backfill: campaigns funded before this migration get the same placements and
-- installer jobs that funding now opens. 600 minor units is rate card v1's
-- installation rate (src/lib/campaigns/pricing.ts).
INSERT INTO "placements" ("id", "campaign_id", "asset_id", "location_id", "updated_at")
SELECT 'bf' || md5(a."id"), a."campaign_id", a."id", a."location_id", CURRENT_TIMESTAMP
FROM "campaign_assets" a
JOIN "campaigns" c ON c."id" = a."campaign_id"
WHERE c."funded_at" IS NOT NULL AND a."status" = 'READY' AND a."location_id" IS NOT NULL;

INSERT INTO "jobs" ("id", "placement_id", "campaign_id", "role", "reward_minor", "currency", "updated_at")
SELECT 'bf' || md5(p."id" || ':INSTALLER'), p."id", p."campaign_id", 'INSTALLER', 600, c."currency", CURRENT_TIMESTAMP
FROM "placements" p
JOIN "campaigns" c ON c."id" = p."campaign_id";
