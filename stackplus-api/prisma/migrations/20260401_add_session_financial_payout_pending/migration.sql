CREATE TYPE "SessionFinancialPayoutPurpose" AS ENUM ('SETTLEMENT', 'CAIXINHA');

CREATE TABLE "SessionFinancialPayoutPending" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "purpose" "SessionFinancialPayoutPurpose" NOT NULL,
  "payoutOrderId" TEXT NOT NULL,
  "virtualAccount" TEXT,
  "amount" DECIMAL(10,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SessionFinancialPayoutPending_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionFinancialPayoutPending_sessionId_userId_purpose_key"
  ON "SessionFinancialPayoutPending"("sessionId", "userId", "purpose");

CREATE UNIQUE INDEX "SessionFinancialPayoutPending_payoutOrderId_key"
  ON "SessionFinancialPayoutPending"("payoutOrderId");

CREATE INDEX "SessionFinancialPayoutPending_status_idx"
  ON "SessionFinancialPayoutPending"("status");

ALTER TABLE "SessionFinancialPayoutPending"
  ADD CONSTRAINT "SessionFinancialPayoutPending_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SessionFinancialPayoutPending"
  ADD CONSTRAINT "SessionFinancialPayoutPending_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
