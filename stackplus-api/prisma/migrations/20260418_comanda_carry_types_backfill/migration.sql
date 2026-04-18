-- Parte 2/2: backfill dos itens TRANSFER_IN/OUT criados na abertura de comanda
-- (description fixa 'Saldo transportado da comanda anterior') que nao tem
-- registro em ComandaTransfer — esses sao carries, nao transfers reais.

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
