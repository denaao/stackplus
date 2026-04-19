-- Adiciona tipos STAFF_CAIXINHA e STAFF_RAKEBACK ao enum ComandaItemType.
-- Sao creditos lancados automaticamente na comanda do staff ao encerrar a sessao.

ALTER TYPE "ComandaItemType" ADD VALUE IF NOT EXISTS 'STAFF_CAIXINHA';
ALTER TYPE "ComandaItemType" ADD VALUE IF NOT EXISTS 'STAFF_RAKEBACK';
