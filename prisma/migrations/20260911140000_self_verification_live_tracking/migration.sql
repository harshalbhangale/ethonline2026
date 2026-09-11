
-- CreateEnum
CREATE TYPE "VerificationMode" AS ENUM ('SELF', 'INDEPENDENT');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "treasury_policy_escrow" VARCHAR(42);

-- AlterTable
ALTER TABLE "placements" ADD COLUMN     "spot_check_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verification_mode" "VerificationMode" NOT NULL DEFAULT 'SELF';

-- CreateTable
CREATE TABLE "location_pings" (
    "id" TEXT NOT NULL,
    "placement_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "worker_user_id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy_meters" DOUBLE PRECISION,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_pings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "location_pings_job_id_recorded_at_idx" ON "location_pings"("job_id", "recorded_at");

-- CreateIndex
CREATE INDEX "location_pings_placement_id_recorded_at_idx" ON "location_pings"("placement_id", "recorded_at" DESC);

-- AddForeignKey
ALTER TABLE "location_pings" ADD CONSTRAINT "location_pings_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_pings" ADD CONSTRAINT "location_pings_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_pings" ADD CONSTRAINT "location_pings_worker_user_id_fkey" FOREIGN KEY ("worker_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

