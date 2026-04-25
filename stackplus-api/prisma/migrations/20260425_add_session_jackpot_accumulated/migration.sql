-- AlterTable: guarda o jackpot acumulado no momento em que a sessão foi aberta
ALTER TABLE "Session" ADD COLUMN "jackpotAccumulated" DECIMAL(10,2);
