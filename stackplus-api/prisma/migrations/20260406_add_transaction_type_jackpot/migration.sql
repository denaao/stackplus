-- Add JACKPOT transaction type for cash prize records without chip movement.
DO $$
BEGIN
  ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'JACKPOT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
