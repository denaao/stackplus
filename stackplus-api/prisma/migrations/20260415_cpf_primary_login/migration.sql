-- CPF vira obrigatório (NOT NULL) e email vira opcional (nullable)
-- ATENÇÃO: usuários sem CPF cadastrado precisam ter o campo preenchido antes de rodar esta migration

-- 1. Torna email nullable (remove NOT NULL constraint)
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- 2. Garante que cpf tem unique constraint (já deve existir, mas idempotente)
-- Se a constraint já existir, o DO NOTHING evita erro
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'User_cpf_key' AND conrelid = '"User"'::regclass
  ) THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_cpf_key" UNIQUE ("cpf");
  END IF;
END $$;

-- 3. Torna cpf NOT NULL
-- Se houver usuários com cpf NULL, este passo vai falhar.
-- Nesse caso, rode antes:
--   UPDATE "User" SET "cpf" = 'PREENCHER_' || SUBSTRING("id", 1, 8) WHERE "cpf" IS NULL;
ALTER TABLE "User" ALTER COLUMN "cpf" SET NOT NULL;
