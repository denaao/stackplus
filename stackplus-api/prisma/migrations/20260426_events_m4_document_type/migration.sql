-- Migration 4: Suporte a documento estrangeiro no User
-- Adiciona documentType + documentNumber sem remover o campo cpf.
-- Campo cpf permanece para compatibilidade — removido em migracao futura separada.
--
-- Rollback:
--   DROP INDEX IF EXISTS "User_documentType_documentNumber_key";
--   ALTER TABLE "User" DROP COLUMN IF EXISTS "documentNumber";
--   ALTER TABLE "User" DROP COLUMN IF EXISTS "documentType";
--   DROP TYPE IF EXISTS "DocumentType";

-- Passo 1: criar enum
CREATE TYPE "DocumentType" AS ENUM ('CPF', 'PASSPORT');

-- Passo 2: adicionar colunas sem constraint (nullable por enquanto)
ALTER TABLE "User" ADD COLUMN "documentType"   "DocumentType";
ALTER TABLE "User" ADD COLUMN "documentNumber" TEXT;

-- Passo 3: backfill — todos os usuarios existentes sao CPF
UPDATE "User"
SET "documentType"   = 'CPF',
    "documentNumber" = "cpf"
WHERE "documentType" IS NULL;

-- Passo 4: tornar NOT NULL apos backfill completo
ALTER TABLE "User" ALTER COLUMN "documentType"   SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "documentNumber" SET NOT NULL;

-- Passo 5: unique constraint (documentType, documentNumber)
CREATE UNIQUE INDEX "User_documentType_documentNumber_key"
    ON "User" ("documentType", "documentNumber");

-- Validacao pos-migracao sugerida:
-- SELECT COUNT(*) FROM "User" WHERE "documentType" IS NULL OR "documentNumber" IS NULL;
-- Deve retornar 0.
