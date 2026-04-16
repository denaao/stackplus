-- Add caixinhaMode on Session (SPLIT | INDIVIDUAL), default SPLIT to preserve current behavior.
ALTER TABLE "Session" ADD COLUMN "caixinhaMode" TEXT NOT NULL DEFAULT 'SPLIT';

-- Add per-staff caixinha amount (used when caixinhaMode = 'INDIVIDUAL').
ALTER TABLE "SessionStaff" ADD COLUMN "caixinhaAmount" DECIMAL(10,2);
