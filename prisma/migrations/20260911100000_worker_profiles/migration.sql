-- CreateEnum
CREATE TYPE "SelfieCheckStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "WorkerRiskStatus" AS ENUM ('CLEAR', 'REVIEW', 'BLOCKED');

-- CreateTable
CREATE TABLE "worker_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" VARCHAR(80) NOT NULL,
    "selfie_check_status" "SelfieCheckStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "risk_status" "WorkerRiskStatus" NOT NULL DEFAULT 'CLEAR',
    "completed_jobs" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "worker_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "worker_profiles_user_id_key" ON "worker_profiles"("user_id");

-- AddForeignKey
ALTER TABLE "worker_profiles" ADD CONSTRAINT "worker_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

