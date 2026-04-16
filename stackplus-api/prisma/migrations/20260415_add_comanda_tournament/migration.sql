-- CreateEnum
CREATE TYPE "ComandaStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ComandaMode" AS ENUM ('PREPAID', 'POSTPAID');

-- CreateEnum
CREATE TYPE "ComandaItemType" AS ENUM (
  'CASH_BUYIN',
  'CASH_REBUY',
  'CASH_ADDON',
  'CASH_CASHOUT',
  'TOURNAMENT_BUYIN',
  'TOURNAMENT_REBUY',
  'TOURNAMENT_ADDON',
  'TOURNAMENT_BOUNTY_RECEIVED',
  'TOURNAMENT_PRIZE',
  'PAYMENT_PIX_SPOT',
  'PAYMENT_PIX_TERM',
  'PAYMENT_CASH',
  'PAYMENT_CARD',
  'TRANSFER_IN',
  'TRANSFER_OUT'
);

-- CreateEnum
CREATE TYPE "ComandaItemPaymentStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('REGISTRATION', 'RUNNING', 'ON_BREAK', 'FINISHED', 'CANCELED');

-- CreateEnum
CREATE TYPE "TournamentPlayerStatus" AS ENUM ('REGISTERED', 'ACTIVE', 'ELIMINATED', 'WINNER');

-- CreateTable: Comanda
CREATE TABLE "Comanda" (
  "id"             TEXT        NOT NULL,
  "playerId"       TEXT        NOT NULL,
  "homeGameId"     TEXT        NOT NULL,
  "status"         "ComandaStatus"  NOT NULL DEFAULT 'OPEN',
  "mode"           "ComandaMode"    NOT NULL DEFAULT 'PREPAID',
  "creditLimit"    DECIMAL(10,2),
  "balance"        DECIMAL(10,2)    NOT NULL DEFAULT 0,
  "note"           TEXT,
  "openedAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt"       TIMESTAMP(3),
  "openedByUserId" TEXT        NOT NULL,
  "closedByUserId" TEXT,
  "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)     NOT NULL,

  CONSTRAINT "Comanda_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ComandaItem
CREATE TABLE "ComandaItem" (
  "id"                    TEXT             NOT NULL,
  "comandaId"             TEXT             NOT NULL,
  "type"                  "ComandaItemType" NOT NULL,
  "amount"                DECIMAL(10,2)    NOT NULL,
  "description"           TEXT,
  "sessionId"             TEXT,
  "tournamentId"          TEXT,
  "tournamentPlayerId"    TEXT,
  "transactionId"         TEXT,
  "paymentReference"      TEXT,
  "paymentStatus"         "ComandaItemPaymentStatus",
  "paymentVirtualAccount" TEXT,
  "createdByUserId"       TEXT             NOT NULL,
  "createdAt"             TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3)     NOT NULL,

  CONSTRAINT "ComandaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ComandaTransfer
CREATE TABLE "ComandaTransfer" (
  "id"              TEXT         NOT NULL,
  "sourceItemId"    TEXT         NOT NULL,
  "destItemId"      TEXT         NOT NULL,
  "reason"          TEXT,
  "createdByUserId" TEXT         NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ComandaTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Tournament
CREATE TABLE "Tournament" (
  "id"                       TEXT             NOT NULL,
  "homeGameId"               TEXT             NOT NULL,
  "name"                     TEXT             NOT NULL,
  "status"                   "TournamentStatus" NOT NULL DEFAULT 'REGISTRATION',
  "buyInAmount"              DECIMAL(10,2)    NOT NULL,
  "rebuyAmount"              DECIMAL(10,2),
  "addonAmount"              DECIMAL(10,2),
  "bountyAmount"             DECIMAL(10,2),
  "rake"                     DECIMAL(5,2)     NOT NULL DEFAULT 0,
  "startingChips"            INTEGER          NOT NULL,
  "rebuyChips"               INTEGER,
  "addonChips"               INTEGER,
  "lateRegistrationLevel"    INTEGER,
  "rebuyUntilLevel"          INTEGER,
  "addonAfterLevel"          INTEGER,
  "minutesPerLevelPreBreak"  INTEGER          NOT NULL,
  "minutesPerLevelPostBreak" INTEGER,
  "breakAfterLevel"          INTEGER,
  "breakDurationMinutes"     INTEGER,
  "blindTemplateName"        TEXT,
  "currentLevel"             INTEGER          NOT NULL DEFAULT 0,
  "levelStartedAt"           TIMESTAMP(3),
  "isOnBreak"                BOOLEAN          NOT NULL DEFAULT false,
  "breakStartedAt"           TIMESTAMP(3),
  "prizePool"                DECIMAL(10,2)    NOT NULL DEFAULT 0,
  "totalRake"                DECIMAL(10,2)    NOT NULL DEFAULT 0,
  "startedAt"                TIMESTAMP(3),
  "finishedAt"               TIMESTAMP(3),
  "createdAt"                TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3)     NOT NULL,

  CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TournamentBlindLevel
CREATE TABLE "TournamentBlindLevel" (
  "id"           TEXT    NOT NULL,
  "tournamentId" TEXT    NOT NULL,
  "level"        INTEGER NOT NULL,
  "smallBlind"   INTEGER NOT NULL,
  "bigBlind"     INTEGER NOT NULL,
  "ante"         INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "TournamentBlindLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TournamentPlayer
CREATE TABLE "TournamentPlayer" (
  "id"                   TEXT                     NOT NULL,
  "tournamentId"         TEXT                     NOT NULL,
  "playerId"             TEXT                     NOT NULL,
  "comandaId"            TEXT                     NOT NULL,
  "status"               "TournamentPlayerStatus" NOT NULL DEFAULT 'REGISTERED',
  "position"             INTEGER,
  "rebuysCount"          INTEGER                  NOT NULL DEFAULT 0,
  "hasAddon"             BOOLEAN                  NOT NULL DEFAULT false,
  "bountyCollected"      DECIMAL(10,2)            NOT NULL DEFAULT 0,
  "prizeAmount"          DECIMAL(10,2),
  "eliminatedByPlayerId" TEXT,
  "eliminatedAtLevel"    INTEGER,
  "registeredAt"         TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "eliminatedAt"         TIMESTAMP(3),
  "createdAt"            TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3)             NOT NULL,

  CONSTRAINT "TournamentPlayer_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
ALTER TABLE "ComandaTransfer" ADD CONSTRAINT "ComandaTransfer_sourceItemId_key" UNIQUE ("sourceItemId");
ALTER TABLE "ComandaTransfer" ADD CONSTRAINT "ComandaTransfer_destItemId_key" UNIQUE ("destItemId");
ALTER TABLE "TournamentBlindLevel" ADD CONSTRAINT "TournamentBlindLevel_tournamentId_level_key" UNIQUE ("tournamentId", "level");
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_tournamentId_playerId_key" UNIQUE ("tournamentId", "playerId");

-- Indexes: Comanda
CREATE INDEX "Comanda_playerId_idx" ON "Comanda"("playerId");
CREATE INDEX "Comanda_homeGameId_idx" ON "Comanda"("homeGameId");
CREATE INDEX "Comanda_status_idx" ON "Comanda"("status");
CREATE INDEX "Comanda_playerId_homeGameId_status_idx" ON "Comanda"("playerId", "homeGameId", "status");

-- Indexes: ComandaItem
CREATE INDEX "ComandaItem_comandaId_idx" ON "ComandaItem"("comandaId");
CREATE INDEX "ComandaItem_type_idx" ON "ComandaItem"("type");
CREATE INDEX "ComandaItem_tournamentId_idx" ON "ComandaItem"("tournamentId");
CREATE INDEX "ComandaItem_sessionId_idx" ON "ComandaItem"("sessionId");
CREATE INDEX "ComandaItem_paymentStatus_idx" ON "ComandaItem"("paymentStatus");
CREATE INDEX "ComandaItem_paymentReference_idx" ON "ComandaItem"("paymentReference");

-- Indexes: Tournament
CREATE INDEX "Tournament_homeGameId_idx" ON "Tournament"("homeGameId");
CREATE INDEX "Tournament_status_idx" ON "Tournament"("status");
CREATE INDEX "Tournament_homeGameId_status_idx" ON "Tournament"("homeGameId", "status");

-- Indexes: TournamentBlindLevel
CREATE INDEX "TournamentBlindLevel_tournamentId_idx" ON "TournamentBlindLevel"("tournamentId");

-- Indexes: TournamentPlayer
CREATE INDEX "TournamentPlayer_tournamentId_idx" ON "TournamentPlayer"("tournamentId");
CREATE INDEX "TournamentPlayer_playerId_idx" ON "TournamentPlayer"("playerId");
CREATE INDEX "TournamentPlayer_status_idx" ON "TournamentPlayer"("status");

-- Foreign Keys: Comanda
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_homeGameId_fkey" FOREIGN KEY ("homeGameId") REFERENCES "HomeGame"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign Keys: ComandaItem
ALTER TABLE "ComandaItem" ADD CONSTRAINT "ComandaItem_comandaId_fkey" FOREIGN KEY ("comandaId") REFERENCES "Comanda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComandaItem" ADD CONSTRAINT "ComandaItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComandaItem" ADD CONSTRAINT "ComandaItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComandaItem" ADD CONSTRAINT "ComandaItem_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComandaItem" ADD CONSTRAINT "ComandaItem_tournamentPlayerId_fkey" FOREIGN KEY ("tournamentPlayerId") REFERENCES "TournamentPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign Keys: ComandaTransfer
ALTER TABLE "ComandaTransfer" ADD CONSTRAINT "ComandaTransfer_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "ComandaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComandaTransfer" ADD CONSTRAINT "ComandaTransfer_destItemId_fkey" FOREIGN KEY ("destItemId") REFERENCES "ComandaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComandaTransfer" ADD CONSTRAINT "ComandaTransfer_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign Keys: Tournament
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_homeGameId_fkey" FOREIGN KEY ("homeGameId") REFERENCES "HomeGame"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign Keys: TournamentBlindLevel
ALTER TABLE "TournamentBlindLevel" ADD CONSTRAINT "TournamentBlindLevel_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign Keys: TournamentPlayer
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_comandaId_fkey" FOREIGN KEY ("comandaId") REFERENCES "Comanda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_eliminatedByPlayerId_fkey" FOREIGN KEY ("eliminatedByPlayerId") REFERENCES "TournamentPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
