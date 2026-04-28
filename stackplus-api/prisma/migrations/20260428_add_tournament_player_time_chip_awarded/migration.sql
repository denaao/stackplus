-- Migration: add timeChipAwarded to TournamentPlayer
ALTER TABLE "TournamentPlayer"
  ADD COLUMN "timeChipAwarded" BOOLEAN NOT NULL DEFAULT FALSE;
