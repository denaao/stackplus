-- Migration: add staffRetentionPct, staffRetentionDest, rankingRetentionPct to Tournament
-- Both fields are optional (nullable) and default to NULL for existing rows.

ALTER TABLE "Tournament"
  ADD COLUMN "staffRetentionPct"  DECIMAL(5,2),
  ADD COLUMN "staffRetentionDest" TEXT,
  ADD COLUMN "rankingRetentionPct" DECIMAL(5,2);
