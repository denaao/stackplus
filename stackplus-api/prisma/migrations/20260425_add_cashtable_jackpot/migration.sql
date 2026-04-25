-- AlterTable: acumula jackpot na mesa e registra por sangria
ALTER TABLE "CashTable" ADD COLUMN "jackpot" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "CashTableSangria" ADD COLUMN "jackpot" DECIMAL(10,2) NOT NULL DEFAULT 0;
