-- Migration: add timeChipBonus and timeChipUntilLevel to Tournament

ALTER TABLE "Tournament"
  ADD COLUMN "timeChipBonus"      INTEGER,
  ADD COLUMN "timeChipUntilLevel" INTEGER;
