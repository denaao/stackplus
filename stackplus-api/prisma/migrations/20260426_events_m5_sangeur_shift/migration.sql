-- Migration 5: SangeurShift dual FK para eventos
-- Requer Migration 3 (EventSangeurAccess) ja executada.
-- homeGameId/sangeurAccessId tornam-se nullable para suportar contexto de evento.
-- eventId + eventSangeurAccessId adicionados para contexto de evento.
--
-- Rollback:
--   ALTER TABLE "SangeurShift" ALTER COLUMN "homeGameId" SET NOT NULL;
--   ALTER TABLE "SangeurShift" ALTER COLUMN "sangeurAccessId" SET NOT NULL;
--   ALTER TABLE "SangeurShift" DROP COLUMN "eventId";
--   ALTER TABLE "SangeurShift" DROP COLUMN "eventSangeurAccessId";
--   ALTER TABLE "SangeurShift" DROP CONSTRAINT IF EXISTS "sangeur_shift_context_check";

ALTER TABLE "SangeurShift" ALTER COLUMN "homeGameId"      DROP NOT NULL;
ALTER TABLE "SangeurShift" ALTER COLUMN "sangeurAccessId" DROP NOT NULL;

ALTER TABLE "SangeurShift" ADD COLUMN "eventId"              TEXT;
ALTER TABLE "SangeurShift" ADD COLUMN "eventSangeurAccessId" TEXT;

ALTER TABLE "SangeurShift"
  ADD CONSTRAINT "SangeurShift_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SangeurShift"
  ADD CONSTRAINT "SangeurShift_eventSangeurAccessId_fkey"
  FOREIGN KEY ("eventSangeurAccessId") REFERENCES "EventSangeurAccess"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SangeurShift"
  ADD CONSTRAINT "sangeur_shift_context_check"
  CHECK ("homeGameId" IS NOT NULL OR "eventId" IS NOT NULL);

CREATE INDEX "SangeurShift_eventId_idx"              ON "SangeurShift"("eventId");
CREATE INDEX "SangeurShift_eventSangeurAccessId_idx" ON "SangeurShift"("eventSangeurAccessId");
CREATE INDEX "SangeurShift_eventId_status_idx"       ON "SangeurShift"("eventId", "status");
