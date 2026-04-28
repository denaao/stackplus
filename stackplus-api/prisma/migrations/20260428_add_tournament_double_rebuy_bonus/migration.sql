-- Migration: add doubleRebuyBonusChips to Tournament

ALTER TABLE "Tournament"
  ADD COLUMN "doubleRebuyBonusChips" INTEGER;
