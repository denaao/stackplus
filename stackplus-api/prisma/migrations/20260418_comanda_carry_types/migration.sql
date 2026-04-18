-- Adiciona CARRY_IN e CARRY_OUT ao enum ComandaItemType.
-- Separa semanticamente carry de saldo (entre comandas do MESMO jogador no mesmo
-- home game) de TRANSFER_IN/TRANSFER_OUT (entre comandas de jogadores diferentes).

ALTER TYPE "ComandaItemType" ADD VALUE IF NOT EXISTS 'CARRY_IN';
ALTER TYPE "ComandaItemType" ADD VALUE IF NOT EXISTS 'CARRY_OUT';

-- Backfill: itens TRANSFER_IN/OUT criados na abertura de comanda (description
-- fixa 'Saldo transportado da comanda anterior') e que NÃO têm registro em
-- ComandaTransfer (confirma que não é transfer real entre jogadores) viram CARRY.
-- Observação: ALTER TYPE ADD VALUE acima precisa estar em uma transação
-- separada no Postgres antes de poder ser usado. O Prisma migrate executa cada
-- statement em seu próprio controle de transação, mas pra garantir, forçamos
-- COMMIT via bloco DO separado.

COMMIT;

BEGIN;

UPDATE "ComandaItem" ci
SET "type" = 'CARRY_IN'::"ComandaItemType"
WHERE ci."type" = 'TRANSFER_IN'
  AND ci."description" = 'Saldo transportado da comanda anterior'
  AND NOT EXISTS (
    SELECT 1 FROM "ComandaTransfer" ct
    WHERE ct."sourceItemId" = ci."id" OR ct."destItemId" = ci."id"
  );

UPDATE "ComandaItem" ci
SET "type" = 'CARRY_OUT'::"ComandaItemType"
WHERE ci."type" = 'TRANSFER_OUT'
  AND ci."description" = 'Saldo transportado da comanda anterior'
  AND NOT EXISTS (
    SELECT 1 FROM "ComandaTransfer" ct
    WHERE ct."sourceItemId" = ci."id" OR ct."destItemId" = ci."id"
  );
