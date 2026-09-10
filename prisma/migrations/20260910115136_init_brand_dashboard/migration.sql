-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('BRAND', 'WORKER', 'OPERATOR');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'QUOTED', 'FUNDED', 'ASSETS_READY', 'DEPLOYING', 'VERIFYING', 'LIVE', 'EXPIRED', 'REMOVING', 'COMPLETE', 'CANCELLED', 'DISPUTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "privy_user_id" VARCHAR(255) NOT NULL,
    "wallet_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'BRAND',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("organization_id","user_id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "brief_text" TEXT NOT NULL,
    "placement_count" INTEGER NOT NULL,
    "area" VARCHAR(240) NOT NULL,
    "budget_limit_minor" BIGINT NOT NULL,
    "currency" VARCHAR(12) NOT NULL DEFAULT 'USD',
    "destination_url" TEXT NOT NULL,
    "deadline" TIMESTAMPTZ(3) NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_privy_user_id_key" ON "users"("privy_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_created_by_idx" ON "organizations"("created_by");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- CreateIndex
CREATE INDEX "campaigns_organization_id_updated_at_idx" ON "campaigns"("organization_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "campaigns_created_by_idx" ON "campaigns"("created_by");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
