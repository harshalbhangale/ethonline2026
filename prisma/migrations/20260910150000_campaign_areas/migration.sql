-- CreateTable
CREATE TABLE "campaign_areas" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radius_meters" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_areas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_areas_campaign_id_idx" ON "campaign_areas"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_areas_campaign_id_sort_order_key" ON "campaign_areas"("campaign_id", "sort_order");

-- AddForeignKey
ALTER TABLE "campaign_areas" ADD CONSTRAINT "campaign_areas_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

