-- DATA-001 Deploy B: NOT NULL + FK em Transaction.registeredBy + check origin.
--
-- Pré-condição validada antes do deploy (queries de sanity):
--   - 0 registros com origin IS NULL
--   - 0 registros com prefixo 'sangeur:' em registeredBy
--   - 0 registros com registeredBy apontando pra User inexistente
--
-- Este deploy finaliza o ciclo iniciado em 20/04 (Deploy A adicionou o campo
-- origin nullable + backfilled registros legados). Agora apertamos:
--   1. origin NOT NULL (todas as escritas futuras precisam declarar)
--   2. CHECK constraint em origin (só 'C' ou 'S' aceitos)
--   3. FK de registeredBy → User.id (integridade referencial)
--   4. Índice em registeredBy pra acelerar joins da FK

-- 1. NOT NULL
ALTER TABLE "Transaction"
  ALTER COLUMN "origin" SET NOT NULL;

-- 2. CHECK constraint — previne typo/bug futuro gravando valor inválido.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_origin_check"
  CHECK ("origin" IN ('C', 'S'));

-- 3. Índice em registeredBy (antes da FK pra não travar criação do constraint).
CREATE INDEX IF NOT EXISTS "Transaction_registeredBy_idx"
  ON "Transaction"("registeredBy");

-- 4. Foreign key Transaction.registeredBy → User.id
-- ON DELETE RESTRICT: não deleta user se tiver transação registrada por ele
-- (forense). Se precisar deletar user, primeiro reatribuir transactions ou soft-delete.
ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_registeredBy_fkey"
  FOREIGN KEY ("registeredBy") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
