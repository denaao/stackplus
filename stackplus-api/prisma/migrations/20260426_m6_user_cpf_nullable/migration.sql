-- Migration 6: Tornar cpf nullable para suporte a passaportistas
--
-- Context: Migration 4 adicionou documentType + documentNumber.
-- Usuarios CPF ja tem documentNumber = cpf (backfill foi feito).
-- Agora podemos remover o NOT NULL do cpf para que jogadores
-- com PASSPORT possam se cadastrar sem cpf.
--
-- O indice UNIQUE em cpf e mantido — PostgreSQL trata NULL != NULL,
-- entao multiplos passaportistas com cpf = NULL nao causam conflito.
--
-- Rollback:
--   UPDATE "User" SET "cpf" = "documentNumber" WHERE "cpf" IS NULL AND "documentType" = 'CPF';
--   ALTER TABLE "User" ALTER COLUMN "cpf" SET NOT NULL;

ALTER TABLE "User" ALTER COLUMN "cpf" DROP NOT NULL;
