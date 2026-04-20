-- DATA-001 Deploy A: adiciona coluna origin na Transaction + backfill
-- a partir do prefixo legacy "sangeur:" em registeredBy.
-- Coluna fica nullable nesta fase pra permitir rollback seguro.
-- Deploy B (futuro) vai limpar prefix, setar NOT NULL e converter
-- registeredBy em FK formal.

ALTER TABLE "Transaction" ADD COLUMN "origin" TEXT;

-- Backfill atômico: marca 'S' (sangeur) se houver prefixo legacy,
-- 'C' (cashier) caso contrário.
UPDATE "Transaction"
SET "origin" = CASE
  WHEN "registeredBy" LIKE 'sangeur:%' THEN 'S'
  ELSE 'C'
END;
