-- Conta bancária virtual por home game.
-- Saldo atualizado automaticamente por PIX confirmado (in = recebimento, out = pagamento ao jogador).

ALTER TABLE "HomeGame"
ADD COLUMN "bankBalance" DECIMAL(10, 2) NOT NULL DEFAULT 0;

CREATE TYPE "BankTxDirection" AS ENUM ('IN', 'OUT');

CREATE TABLE "HomeGameBankTransaction" (
  "id"            TEXT NOT NULL,
  "homeGameId"    TEXT NOT NULL,
  "direction"     "BankTxDirection" NOT NULL,
  "amount"        DECIMAL(10, 2) NOT NULL,
  "description"   TEXT,
  "comandaItemId" TEXT,
  "annapayRef"    TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HomeGameBankTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HomeGameBankTransaction_homeGameId_idx" ON "HomeGameBankTransaction"("homeGameId");
CREATE INDEX "HomeGameBankTransaction_comandaItemId_idx" ON "HomeGameBankTransaction"("comandaItemId");
CREATE INDEX "HomeGameBankTransaction_createdAt_idx" ON "HomeGameBankTransaction"("createdAt");

ALTER TABLE "HomeGameBankTransaction"
ADD CONSTRAINT "HomeGameBankTransaction_homeGameId_fkey"
FOREIGN KEY ("homeGameId") REFERENCES "HomeGame"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
