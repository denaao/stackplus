-- Migration 3: EventSangeurAccess
-- Purely additive. Espelho de HomeGameSangeurAccess com FK para Event.
-- Requer Migration 1 (Event table) ja executada.
--
-- Rollback: DROP TABLE "EventSangeurAccess";

CREATE TABLE "EventSangeurAccess" (
    "id"                       TEXT NOT NULL,
    "eventId"                  TEXT NOT NULL,
    "userId"                   TEXT NOT NULL,
    "username"                 TEXT NOT NULL,
    "passwordHash"             TEXT NOT NULL,
    "isActive"                 BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword"       BOOLEAN NOT NULL DEFAULT true,
    "activationToken"          TEXT,
    "activationTokenExpiresAt" TIMESTAMP(3),
    "lastLoginAt"              TIMESTAMP(3),
    "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSangeurAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventSangeurAccess_activationToken_key"
    ON "EventSangeurAccess"("activationToken");

CREATE UNIQUE INDEX "EventSangeurAccess_eventId_userId_key"
    ON "EventSangeurAccess"("eventId", "userId");

CREATE UNIQUE INDEX "EventSangeurAccess_eventId_username_key"
    ON "EventSangeurAccess"("eventId", "username");

CREATE INDEX "EventSangeurAccess_eventId_idx"  ON "EventSangeurAccess"("eventId");
CREATE INDEX "EventSangeurAccess_userId_idx"   ON "EventSangeurAccess"("userId");

ALTER TABLE "EventSangeurAccess"
    ADD CONSTRAINT "EventSangeurAccess_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventSangeurAccess"
    ADD CONSTRAINT "EventSangeurAccess_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
