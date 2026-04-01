ALTER TABLE "User"
ADD COLUMN "cpf" TEXT;

CREATE UNIQUE INDEX "User_cpf_key"
ON "User"("cpf");
