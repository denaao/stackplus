-- Link SangeurSale to the session player (sessionUserId) and to the created Transaction
-- so that sales done by the mobile POS (sangeur) also affect the session cashier totals
-- and the player account. Used by the cashier side panel to show sangeur activity live.

ALTER TABLE "SangeurSale"
  ADD COLUMN IF NOT EXISTS "sessionUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "transactionId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SangeurSale_sessionUserId_fkey'
  ) THEN
    ALTER TABLE "SangeurSale"
      ADD CONSTRAINT "SangeurSale_sessionUserId_fkey"
      FOREIGN KEY ("sessionUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SangeurSale_transactionId_fkey'
  ) THEN
    ALTER TABLE "SangeurSale"
      ADD CONSTRAINT "SangeurSale_transactionId_fkey"
      FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "SangeurSale_transactionId_key" ON "SangeurSale"("transactionId");
CREATE INDEX IF NOT EXISTS "SangeurSale_sessionUserId_idx" ON "SangeurSale"("sessionUserId");
