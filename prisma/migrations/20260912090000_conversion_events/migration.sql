-- What happened after a scan, reported by the brand's own site. Each row is
-- tied to the scan that caused it, so a signup is attributable to one poster.
CREATE TABLE "conversion_events" (
  "id" TEXT NOT NULL,
  "scan_event_id" TEXT NOT NULL,
  "asset_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "name" VARCHAR(60) NOT NULL,
  "value_minor" BIGINT,
  "currency" VARCHAR(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conversion_events_pkey" PRIMARY KEY ("id")
);

-- One row per scan per event name, so a refreshed page cannot inflate counts.
CREATE UNIQUE INDEX "conversion_events_scan_event_id_name_key"
  ON "conversion_events" ("scan_event_id", "name");

CREATE INDEX "conversion_events_campaign_id_created_at_idx"
  ON "conversion_events" ("campaign_id", "created_at" DESC);

CREATE INDEX "conversion_events_asset_id_created_at_idx"
  ON "conversion_events" ("asset_id", "created_at" DESC);

ALTER TABLE "conversion_events"
  ADD CONSTRAINT "conversion_events_scan_event_id_fkey"
  FOREIGN KEY ("scan_event_id") REFERENCES "scan_events" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversion_events"
  ADD CONSTRAINT "conversion_events_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "campaign_assets" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversion_events"
  ADD CONSTRAINT "conversion_events_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "campaigns" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
