-- SEC-004: Refresh token pattern
--
-- Cria tabela RefreshToken. Login passa a emitir {accessToken (15min),
-- refreshToken (30d)}. Access token vida curta reduz janela de exposição
-- em caso de vazamento. Refresh token fica só no backend (hash SHA-256)
-- e é rotacionado a cada uso — se alguém roubar e usar, o legítimo é
-- invalidado e percebe na próxima operação.
--
-- Migração é aditiva: access tokens antigos (JWT vida longa) continuam
-- aceitos até expirar. Ninguém é deslogado no deploy.

CREATE TABLE "RefreshToken" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "replacedBy" UUID,
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

ALTER TABLE "RefreshToken"
  ADD CONSTRAINT "RefreshToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
