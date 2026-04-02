CREATE TABLE "SessionRakeback" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SessionRakeback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionRakeback_sessionId_userId_key" ON "SessionRakeback"("sessionId", "userId");
CREATE INDEX "SessionRakeback_sessionId_idx" ON "SessionRakeback"("sessionId");
CREATE INDEX "SessionRakeback_userId_idx" ON "SessionRakeback"("userId");

ALTER TABLE "SessionRakeback"
ADD CONSTRAINT "SessionRakeback_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SessionRakeback"
ADD CONSTRAINT "SessionRakeback_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
