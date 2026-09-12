-- World Selfie Check: the verified credential's identity and validity window.
ALTER TABLE "worker_profiles"
  ADD COLUMN "selfie_nullifier" VARCHAR(128),
  ADD COLUMN "selfie_verified_at" TIMESTAMPTZ(3),
  ADD COLUMN "selfie_expires_at" TIMESTAMPTZ(3);

-- One human, one worker account.
CREATE UNIQUE INDEX "worker_profiles_selfie_nullifier_key"
  ON "worker_profiles" ("selfie_nullifier");
