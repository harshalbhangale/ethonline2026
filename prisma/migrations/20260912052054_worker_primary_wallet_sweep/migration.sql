-- AlterEnum
ALTER TYPE "ChainTransactionKind" ADD VALUE 'WORKER_PAYOUT_SWEEP';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "payout_wallet_id" VARCHAR(64),
ADD COLUMN     "primary_wallet_address" VARCHAR(64);
