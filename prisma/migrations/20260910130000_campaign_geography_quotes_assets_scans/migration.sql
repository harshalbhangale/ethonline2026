-- CreateEnum
CREATE TYPE "CampaignWizardStep" AS ENUM ('BRIEF', 'LOCATION', 'PLACEMENTS', 'CREATIVE', 'REVIEW');

-- CreateEnum
CREATE TYPE "LocationStrategy" AS ENUM ('AUTO_APPROVED', 'MANUAL_SELECTION');

-- CreateEnum
CREATE TYPE "LocationPermissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CampaignLocationSource" AS ENUM ('BRAND', 'SYSTEM');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "QuoteLineItemKind" AS ENUM ('PRINTING', 'INSTALLATION', 'VERIFICATION', 'CLEANUP_RESERVE', 'PLATFORM_FEE', 'CONTINGENCY');

-- CreateEnum
CREATE TYPE "CampaignAssetStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'DISABLED');

-- RenameColumn: preserve existing free-text area values as the generated human label.
-- `area_label` is descriptive only; structured geography columns below are the source of truth.
ALTER TABLE "campaigns" RENAME COLUMN "area" TO "area_label";
ALTER TABLE "campaigns" ALTER COLUMN "area_label" DROP NOT NULL;

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "artwork_hash" VARCHAR(128),
ADD COLUMN     "artwork_url" TEXT,
ADD COLUMN     "center_latitude" DOUBLE PRECISION,
ADD COLUMN     "center_longitude" DOUBLE PRECISION,
ADD COLUMN     "city" VARCHAR(160),
ADD COLUMN     "country_code" VARCHAR(2),
ADD COLUMN     "country_name" VARCHAR(120),
ADD COLUMN     "funded_at" TIMESTAMPTZ(3),
ADD COLUMN     "funding_reference" VARCHAR(120),
ADD COLUMN     "location_strategy" "LocationStrategy",
ADD COLUMN     "radius_meters" INTEGER,
ADD COLUMN     "wizard_step" "CampaignWizardStep" NOT NULL DEFAULT 'BRIEF',
ALTER COLUMN "placement_count" DROP NOT NULL,
ALTER COLUMN "budget_limit_minor" DROP NOT NULL,
ALTER COLUMN "destination_url" DROP NOT NULL,
ALTER COLUMN "deadline" DROP NOT NULL;

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "venue_name" VARCHAR(160) NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "country_name" VARCHAR(120) NOT NULL,
    "city" VARCHAR(160) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "surface_photo_url" TEXT,
    "placement_instructions" TEXT NOT NULL,
    "permission_status" "LocationPermissionStatus" NOT NULL DEFAULT 'PENDING',
    "max_active_campaigns" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_locations" (
    "campaign_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "source" "CampaignLocationSource" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_locations_pkey" PRIMARY KEY ("campaign_id","location_id")
);

-- CreateTable
CREATE TABLE "campaign_quotes" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" VARCHAR(12) NOT NULL DEFAULT 'USD',
    "total_minor" BIGINT NOT NULL,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "campaign_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_quote_line_items" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "kind" "QuoteLineItemKind" NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "campaign_quote_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_assets" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "location_id" TEXT,
    "short_code" VARCHAR(32) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "qr_payload" TEXT NOT NULL,
    "destination_url" TEXT NOT NULL,
    "artwork_hash" VARCHAR(128),
    "rendered_asset_url" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "CampaignAssetStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "campaign_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_events" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "referrer" TEXT,
    "user_agent_hash" VARCHAR(64),
    "session_hash" VARCHAR(64),
    "coarse_region" VARCHAR(120),
    "is_suspected_bot" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_slug_key" ON "locations"("slug");

-- CreateIndex
CREATE INDEX "locations_country_code_city_idx" ON "locations"("country_code", "city");

-- CreateIndex
CREATE INDEX "locations_permission_status_idx" ON "locations"("permission_status");

-- CreateIndex
CREATE INDEX "campaign_locations_location_id_idx" ON "campaign_locations"("location_id");

-- CreateIndex
CREATE INDEX "campaign_quotes_campaign_id_status_idx" ON "campaign_quotes"("campaign_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_quotes_campaign_id_version_key" ON "campaign_quotes"("campaign_id", "version");

-- CreateIndex
CREATE INDEX "campaign_quote_line_items_quote_id_idx" ON "campaign_quote_line_items"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_quote_line_items_quote_id_kind_key" ON "campaign_quote_line_items"("quote_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_assets_short_code_key" ON "campaign_assets"("short_code");

-- CreateIndex
CREATE INDEX "campaign_assets_campaign_id_idx" ON "campaign_assets"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_assets_location_id_idx" ON "campaign_assets"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_assets_campaign_id_sequence_key" ON "campaign_assets"("campaign_id", "sequence");

-- CreateIndex
CREATE INDEX "scan_events_campaign_id_created_at_idx" ON "scan_events"("campaign_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "scan_events_asset_id_created_at_idx" ON "scan_events"("asset_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "scan_events_session_hash_idx" ON "scan_events"("session_hash");

-- CreateIndex
CREATE INDEX "campaigns_country_code_city_idx" ON "campaigns"("country_code", "city");

-- AddForeignKey
ALTER TABLE "campaign_locations" ADD CONSTRAINT "campaign_locations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_locations" ADD CONSTRAINT "campaign_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_quotes" ADD CONSTRAINT "campaign_quotes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_quote_line_items" ADD CONSTRAINT "campaign_quote_line_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "campaign_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_assets" ADD CONSTRAINT "campaign_assets_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_assets" ADD CONSTRAINT "campaign_assets_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "campaign_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

