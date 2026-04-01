CREATE TABLE "SessionFinancialChargePending" (
  "id" TEXT NOT NULL,
  "chargeId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "virtualAccount" TEXT,
  "amount" DECIMAL(10,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SessionFinancialChargePending_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionFinancialChargePending_sessionId_userId_key"
  ON "SessionFinancialChargePending"("sessionId", "userId");

CREATE INDEX "SessionFinancialChargePending_chargeId_idx"
  ON "SessionFinancialChargePending"("chargeId");

CREATE INDEX "SessionFinancialChargePending_status_idx"
  ON "SessionFinancialChargePending"("status");

ALTER TABLE "SessionFinancialChargePending"
  ADD CONSTRAINT "SessionFinancialChargePending_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SessionFinancialChargePending"
  ADD CONSTRAINT "SessionFinancialChargePending_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
