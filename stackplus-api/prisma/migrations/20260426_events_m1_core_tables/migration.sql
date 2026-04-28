-- Migration 1: Módulo de Eventos — tabelas base
-- Purely additive. Zero impacto em tabelas existentes.
-- Rollback: DROP TABLE "EventDailyClose", "EventStaff", "Event";
--           DROP TYPE "DailyCloseStatus", "EventStaffRole", "EventStatus";

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'OPEN', 'IN_PROGRESS', 'FINISHED', 'CANCELED');

CREATE TYPE "EventStaffRole" AS ENUM ('HOST', 'CASHIER', 'DEALER', 'SANGEUR');

CREATE TYPE "DailyCloseStatus" AS ENUM ('OPEN', 'CLOSED');

-- ─── Event ────────────────────────────────────────────────────────────────────

CREATE TABLE "Event" (
    "id"                   TEXT NOT NULL,
    "name"                 TEXT NOT NULL,
    "description"          TEXT,
    "venue"                TEXT,
    "hostId"               TEXT NOT NULL,
    "status"               "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate"            TIMESTAMP(3) NOT NULL,
    "endDate"              TIMESTAMP(3) NOT NULL,
    "registrationOpenAt"   TIMESTAMP(3),
    "registrationCloseAt"  TIMESTAMP(3),
    "isPublic"             BOOLEAN NOT NULL DEFAULT true,
    "accessCode"           TEXT,
    "financialModule"      "FinancialModule" NOT NULL DEFAULT 'POSTPAID',
    "chipValue"            DECIMAL(10,2) NOT NULL,
    "bankBalance"          DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Event_accessCode_key"  ON "Event"("accessCode");
CREATE INDEX        "Event_hostId_idx"      ON "Event"("hostId");
CREATE INDEX        "Event_status_idx"      ON "Event"("status");
CREATE INDEX        "Event_startDate_idx"   ON "Event"("startDate");
CREATE INDEX        "Event_hostId_status_idx" ON "Event"("hostId", "status");

ALTER TABLE "Event"
    ADD CONSTRAINT "Event_hostId_fkey"
    FOREIGN KEY ("hostId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── EventStaff ───────────────────────────────────────────────────────────────

CREATE TABLE "EventStaff" (
    "id"        TEXT NOT NULL,
    "eventId"   TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "role"      "EventStaffRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventStaff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventStaff_eventId_userId_key" ON "EventStaff"("eventId", "userId");
CREATE INDEX        "EventStaff_eventId_idx"         ON "EventStaff"("eventId");
CREATE INDEX        "EventStaff_userId_idx"           ON "EventStaff"("userId");
CREATE INDEX        "EventStaff_eventId_role_idx"     ON "EventStaff"("eventId", "role");

ALTER TABLE "EventStaff"
    ADD CONSTRAINT "EventStaff_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventStaff"
    ADD CONSTRAINT "EventStaff_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── EventDailyClose ──────────────────────────────────────────────────────────
-- Snapshot de fechamento de caixa por dia do evento.
-- O campo "date" é DATE (sem hora) — um fechamento por dia por evento.
-- Os campos total* são preenchidos no momento do fechamento (imutáveis).

CREATE TABLE "EventDailyClose" (
    "id"             TEXT NOT NULL,
    "eventId"        TEXT NOT NULL,
    "date"           DATE NOT NULL,
    "status"         "DailyCloseStatus" NOT NULL DEFAULT 'OPEN',
    "closedByUserId" TEXT,
    "closedAt"       TIMESTAMP(3),
    "notes"          TEXT,
    "totalIn"        DECIMAL(10,2),
    "totalOut"       DECIMAL(10,2),
    "totalPix"       DECIMAL(10,2),
    "totalCash"      DECIMAL(10,2),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventDailyClose_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventDailyClose_eventId_date_key" ON "EventDailyClose"("eventId", "date");
CREATE INDEX        "EventDailyClose_eventId_idx"       ON "EventDailyClose"("eventId");
CREATE INDEX        "EventDailyClose_status_idx"        ON "EventDailyClose"("status");
CREATE INDEX        "EventDailyClose_date_idx"          ON "EventDailyClose"("date");

ALTER TABLE "EventDailyClose"
    ADD CONSTRAINT "EventDailyClose_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventDailyClose"
    ADD CONSTRAINT "EventDailyClose_closedByUserId_fkey"
    FOREIGN KEY ("closedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
