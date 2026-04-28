-- Migration: add totalChipsInPlay to Tournament and buyInChips to TournamentPlayer
ALTER TABLE "Tournament"
  ADD COLUMN "totalChipsInPlay" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "TournamentPlayer"
  ADD COLUMN "buyInChips" INTEGER NOT NULL DEFAULT 0;
