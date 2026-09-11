-- Retires the parallel job system added by 20260911120000_worker_jobs.
--
-- The Worker PWA now runs on placements, jobs and evidence (the model the
-- onchain escrow and the Chainlink CRE verifier settle against), so these
-- tables are no longer read or written. Apply only after confirming their rows
-- are test data.
DROP TABLE IF EXISTS "ledger_entries";
DROP TABLE IF EXISTS "placement_proofs";
DROP TABLE IF EXISTS "placement_jobs";
DROP TYPE IF EXISTS "LedgerEntryKind";
DROP TYPE IF EXISTS "PlacementJobRole";
DROP TYPE IF EXISTS "PlacementJobStatus";
