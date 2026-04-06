CREATE TABLE IF NOT EXISTS "HomeGameSangeurAccess" (
  "id" TEXT NOT NULL,
  "homeGameId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HomeGameSangeurAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HomeGameSangeurAccess_homeGameId_userId_key"
ON "HomeGameSangeurAccess"("homeGameId", "userId");

CREATE UNIQUE INDEX IF NOT EXISTS "HomeGameSangeurAccess_homeGameId_username_key"
ON "HomeGameSangeurAccess"("homeGameId", "username");

CREATE INDEX IF NOT EXISTS "HomeGameSangeurAccess_homeGameId_idx"
ON "HomeGameSangeurAccess"("homeGameId");

CREATE INDEX IF NOT EXISTS "HomeGameSangeurAccess_userId_idx"
ON "HomeGameSangeurAccess"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'HomeGameSangeurAccess_homeGameId_fkey'
  ) THEN
    ALTER TABLE "HomeGameSangeurAccess"
    ADD CONSTRAINT "HomeGameSangeurAccess_homeGameId_fkey"
    FOREIGN KEY ("homeGameId") REFERENCES "HomeGame"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'HomeGameSangeurAccess_userId_fkey'
  ) THEN
    ALTER TABLE "HomeGameSangeurAccess"
    ADD CONSTRAINT "HomeGameSangeurAccess_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
