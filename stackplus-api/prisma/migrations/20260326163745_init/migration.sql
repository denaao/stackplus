-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PLAYER',
    "avatarUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HomeGame" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "chipValue" REAL NOT NULL,
    "rules" TEXT,
    "joinCode" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HomeGame_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HomeGameMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "homeGameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HomeGameMember_homeGameId_fkey" FOREIGN KEY ("homeGameId") REFERENCES "HomeGame" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HomeGameMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "homeGameId" TEXT NOT NULL,
    "cashierId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Session_homeGameId_fkey" FOREIGN KEY ("homeGameId") REFERENCES "HomeGame" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Session_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerSessionState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chipsIn" REAL NOT NULL DEFAULT 0,
    "chipsOut" REAL NOT NULL DEFAULT 0,
    "currentStack" REAL NOT NULL DEFAULT 0,
    "result" REAL NOT NULL DEFAULT 0,
    "hasCashedOut" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerSessionState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerSessionState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "chips" REAL NOT NULL,
    "note" TEXT,
    "registeredBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "HomeGame_joinCode_key" ON "HomeGame"("joinCode");

-- CreateIndex
CREATE INDEX "HomeGameMember_homeGameId_idx" ON "HomeGameMember"("homeGameId");

-- CreateIndex
CREATE INDEX "HomeGameMember_userId_idx" ON "HomeGameMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HomeGameMember_homeGameId_userId_key" ON "HomeGameMember"("homeGameId", "userId");

-- CreateIndex
CREATE INDEX "Session_homeGameId_idx" ON "Session"("homeGameId");

-- CreateIndex
CREATE INDEX "Session_status_idx" ON "Session"("status");

-- CreateIndex
CREATE INDEX "PlayerSessionState_sessionId_idx" ON "PlayerSessionState"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerSessionState_sessionId_userId_key" ON "PlayerSessionState"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "Transaction_sessionId_userId_idx" ON "Transaction"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "Transaction_sessionId_type_idx" ON "Transaction"("sessionId", "type");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");
