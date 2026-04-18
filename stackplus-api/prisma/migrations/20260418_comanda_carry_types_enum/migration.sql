-- Parte 1/2 do refactor: adiciona valores CARRY_IN/CARRY_OUT ao enum.
-- ALTER TYPE ... ADD VALUE NAO pode rodar na mesma transaction em que o valor
-- e usado (restricao do Postgres), por isso o backfill fica em migration separada
-- (20260418_comanda_carry_types_backfill).

ALTER TYPE "ComandaItemType" ADD VALUE IF NOT EXISTS 'CARRY_IN';
ALTER TYPE "ComandaItemType" ADD VALUE IF NOT EXISTS 'CARRY_OUT';
