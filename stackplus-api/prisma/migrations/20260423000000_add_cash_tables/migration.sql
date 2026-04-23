-- CreateEnum
CREATE TYPE "CashTableStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterTable
ALTER TABLE "PlayerSessionState" DROP COLUMN "currentStack";

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "caixinha",
DROP COLUMN "caixinhaMode",
DROP COLUMN "rake";

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "tableId" TEXT;

-- CreateTable
CREATE TABLE "CashTable" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Mesa 1',
    "status" "CashTableStatus" NOT NULL DEFAULT 'OPEN',
    "caixinhaMode" TEXT NOT NULL DEFAULT 'SPLIT',
    "rake" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "caixinha" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CashTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashTableSeat" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentStack" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "hasCashedOut" BOOLEAN NOT NULL DEFAULT false,
    "seatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cashedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CashTableSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashTableSangria" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "rake" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "caixinha" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashTableSangria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashTable_sessionId_idx" ON "CashTable"("sessionId");

-- CreateIndex
CREATE INDEX "CashTable_status_idx" ON "CashTable"("status");

-- CreateIndex
CREATE INDEX "CashTable_sessionId_status_idx" ON "CashTable"("sessionId", "status");

-- CreateIndex
CREATE INDEX "CashTableSeat_tableId_idx" ON "CashTableSeat"("tableId");

-- CreateIndex
CREATE INDEX "CashTableSeat_userId_idx" ON "CashTableSeat"("userId");

-- CreateIndex
CREATE INDEX "CashTableSeat_tableId_hasCashedOut_idx" ON "CashTableSeat"("tableId", "hasCashedOut");

-- CreateIndex
CREATE UNIQUE INDEX "CashTableSeat_tableId_userId_key" ON "CashTableSeat"("tableId", "userId");

-- CreateIndex
CREATE INDEX "CashTableSangria_tableId_idx" ON "CashTableSangria"("tableId");

-- CreateIndex
CREATE INDEX "CashTableSangria_tableId_isFinal_idx" ON "CashTableSangria"("tableId", "isFinal");

-- CreateIndex
CREATE INDEX "CashTableSangria_createdAt_idx" ON "CashTableSangria"("createdAt");

-- CreateIndex
CREATE INDEX "Transaction_tableId_idx" ON "Transaction"("tableId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "CashTable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTable" ADD CONSTRAINT "CashTable_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTableSeat" ADD CONSTRAINT "CashTableSeat_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "CashTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTableSeat" ADD CONSTRAINT "CashTableSeat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTableSangria" ADD CONSTRAINT "CashTableSangria_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "CashTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTableSangria" ADD CONSTRAINT "CashTableSangria_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
