-- The printed asset tier a campaign uses. Each tier carries a price multiplier
-- applied to per-placement fulfilment costs in the deterministic quote engine.
CREATE TYPE "AssetType" AS ENUM ('QR_NORMAL', 'QR_MAGIC', 'QR_VERY_MAGIC', 'NFC');

-- Existing drafts default to the plain QR tier (1x), leaving their prices unchanged.
ALTER TABLE "campaigns"
  ADD COLUMN "asset_type" "AssetType" NOT NULL DEFAULT 'QR_NORMAL';
