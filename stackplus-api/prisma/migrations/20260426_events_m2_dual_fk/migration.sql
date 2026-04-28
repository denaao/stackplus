-- Migration 2: Dual FK nullable em Tournament, Session, Comanda
-- Requer Migration 1 (Event table) ja executada.
-- Zero perda de dados — apenas ALTER COLUMN + ADD COLUMN.
--
-- Rollback:
--   ALTER TABLE "Tournament" DROP COLUMN "eventId", ALTER COLUMN "homeGameId" SET NOT NULL;
--   ALTER TABLE "Session"    DROP COLUMN "eventId", ALTER COLUMN "homeGameId" SET NOT NULL;
--   ALTER TABLE "Comanda"    DROP COLUMN "eventId", ALTER COLUMN "homeGameId" SET NOT NULL;
--   DROP INDEX IF EXISTS "comanda_player_event_open_unique";
--   DROP INDEX IF EXISTS "comanda_player_hg_open_unique";

-- ─── TOURNAMENT ───────────────────────────────────────────────────────────────

ALTER TABLE "Tournament" ALTER COLUMN "homeGameId" DROP NOT NULL;

ALTER TABLE "Tournament" ADD COLUMN "eventId" TEXT;

ALTER TABLE "Tournament"
  ADD CONSTRAINT "Tournament_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Tournament"
  ADD CONSTRAINT "tournament_context_check"
  CHECK ("homeGameId" IS NOT NULL OR "eventId" IS NOT NULL);

CREATE INDEX "Tournament_eventId_idx"        ON "Tournament"("eventId");
CREATE INDEX "Tournament_eventId_status_idx" ON "Tournament"("eventId", "status");

-- ─── SESSION ──────────────────────────────────────────────────────────────────

ALTER TABLE "Session" ALTER COLUMN "homeGameId" DROP NOT NULL;

ALTER TABLE "Session" ADD COLUMN "eventId" TEXT;

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Session"
  ADD CONSTRAINT "session_context_check"
  CHECK ("homeGameId" IS NOT NULL OR "eventId" IS NOT NULL);

CREATE INDEX "Session_eventId_idx"              ON "Session"("eventId");
CREATE INDEX "Session_eventId_status_idx"       ON "Session"("eventId", "status", "finishedAt");
CREATE INDEX "Session_eventId_createdAt_idx"    ON "Session"("eventId", "createdAt");

-- ─── COMANDA ──────────────────────────────────────────────────────────────────

ALTER TABLE "Comanda" ALTER COLUMN "homeGameId" DROP NOT NULL;

ALTER TABLE "Comanda" ADD COLUMN "eventId" TEXT;

ALTER TABLE "Comanda"
  ADD CONSTRAINT "Comanda_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Comanda"
  ADD CONSTRAINT "comanda_context_check"
  CHECK ("homeGameId" IS NOT NULL OR "eventId" IS NOT NULL);

-- Regra: apenas UMA comanda OPEN por jogador por contexto (home game ou evento).
-- Multiplas CLOSED sao permitidas — sao historico de sessoes anteriores.
-- Nao ha constraint anterior a dropar (nunca foi criada no banco).
--
-- Index para home game: um jogador nao pode ter duas comandas abertas no mesmo home game.
CREATE UNIQUE INDEX "comanda_player_hg_open_unique"
  ON "Comanda" ("playerId", "homeGameId")
  WHERE "homeGameId" IS NOT NULL AND "status" = 'OPEN';

-- Index para evento: um jogador nao pode ter duas comandas abertas no mesmo evento.
CREATE UNIQUE INDEX "comanda_player_event_open_unique"
  ON "Comanda" ("playerId", "eventId")
  WHERE "eventId" IS NOT NULL AND "status" = 'OPEN';

CREATE INDEX "Comanda_eventId_idx"        ON "Comanda"("eventId");
CREATE INDEX "Comanda_eventId_status_idx" ON "Comanda"("eventId", "status");
