DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SangeurShiftStatus') THEN
    CREATE TYPE "SangeurShiftStatus" AS ENUM ('OPEN', 'CLOSED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SangeurMovementType') THEN
    CREATE TYPE "SangeurMovementType" AS ENUM ('INITIAL_LOAD', 'RELOAD', 'RETURN');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SangeurPaymentMethod') THEN
    CREATE TYPE "SangeurPaymentMethod" AS ENUM ('PIX_QR', 'VOUCHER', 'CASH', 'CARD');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SangeurPaymentStatus') THEN
    CREATE TYPE "SangeurPaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SangeurShift" (
  "id" TEXT NOT NULL,
  "homeGameId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "sangeurAccessId" TEXT NOT NULL,
  "sangeurUserId" TEXT NOT NULL,
  "status" "SangeurShiftStatus" NOT NULL DEFAULT 'OPEN',
  "initialChips" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "note" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SangeurShift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SangeurShiftMovement" (
  "id" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "type" "SangeurMovementType" NOT NULL,
  "chips" DECIMAL(10,2) NOT NULL,
  "note" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SangeurShiftMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SangeurSale" (
  "id" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "chips" DECIMAL(10,2) NOT NULL,
  "chipValue" DECIMAL(10,2) NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "paymentMethod" "SangeurPaymentMethod" NOT NULL,
  "paymentStatus" "SangeurPaymentStatus" NOT NULL DEFAULT 'PAID',
  "paymentReference" TEXT,
  "voucherCode" TEXT,
  "playerName" TEXT,
  "note" TEXT,
  "settledAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SangeurSale_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SangeurShift_homeGameId_idx" ON "SangeurShift"("homeGameId");
CREATE INDEX IF NOT EXISTS "SangeurShift_sessionId_idx" ON "SangeurShift"("sessionId");
CREATE INDEX IF NOT EXISTS "SangeurShift_sangeurUserId_idx" ON "SangeurShift"("sangeurUserId");
CREATE INDEX IF NOT EXISTS "SangeurShift_status_idx" ON "SangeurShift"("status");
CREATE INDEX IF NOT EXISTS "SangeurShiftMovement_shiftId_idx" ON "SangeurShiftMovement"("shiftId");
CREATE INDEX IF NOT EXISTS "SangeurShiftMovement_type_idx" ON "SangeurShiftMovement"("type");
CREATE INDEX IF NOT EXISTS "SangeurShiftMovement_createdAt_idx" ON "SangeurShiftMovement"("createdAt");
CREATE INDEX IF NOT EXISTS "SangeurSale_shiftId_idx" ON "SangeurSale"("shiftId");
CREATE INDEX IF NOT EXISTS "SangeurSale_paymentMethod_idx" ON "SangeurSale"("paymentMethod");
CREATE INDEX IF NOT EXISTS "SangeurSale_paymentStatus_idx" ON "SangeurSale"("paymentStatus");
CREATE INDEX IF NOT EXISTS "SangeurSale_createdAt_idx" ON "SangeurSale"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SangeurShift_homeGameId_fkey'
  ) THEN
    ALTER TABLE "SangeurShift"
    ADD CONSTRAINT "SangeurShift_homeGameId_fkey"
    FOREIGN KEY ("homeGameId") REFERENCES "HomeGame"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SangeurShift_sessionId_fkey'
  ) THEN
    ALTER TABLE "SangeurShift"
    ADD CONSTRAINT "SangeurShift_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SangeurShift_sangeurAccessId_fkey'
  ) THEN
    ALTER TABLE "SangeurShift"
    ADD CONSTRAINT "SangeurShift_sangeurAccessId_fkey"
    FOREIGN KEY ("sangeurAccessId") REFERENCES "HomeGameSangeurAccess"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SangeurShift_sangeurUserId_fkey'
  ) THEN
    ALTER TABLE "SangeurShift"
    ADD CONSTRAINT "SangeurShift_sangeurUserId_fkey"
    FOREIGN KEY ("sangeurUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SangeurShiftMovement_shiftId_fkey'
  ) THEN
    ALTER TABLE "SangeurShiftMovement"
    ADD CONSTRAINT "SangeurShiftMovement_shiftId_fkey"
    FOREIGN KEY ("shiftId") REFERENCES "SangeurShift"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SangeurShiftMovement_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "SangeurShiftMovement"
    ADD CONSTRAINT "SangeurShiftMovement_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SangeurSale_shiftId_fkey'
  ) THEN
    ALTER TABLE "SangeurSale"
    ADD CONSTRAINT "SangeurSale_shiftId_fkey"
    FOREIGN KEY ("shiftId") REFERENCES "SangeurShift"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SangeurSale_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "SangeurSale"
    ADD CONSTRAINT "SangeurSale_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
