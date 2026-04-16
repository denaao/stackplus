-- Rename minutesPerLevelPreBreak -> minutesPerLevelPreLateReg
ALTER TABLE "Tournament" RENAME COLUMN "minutesPerLevelPreBreak" TO "minutesPerLevelPreLateReg";

-- Rename minutesPerLevelPostBreak -> minutesPerLevelPostLateReg
ALTER TABLE "Tournament" RENAME COLUMN "minutesPerLevelPostBreak" TO "minutesPerLevelPostLateReg";

-- Remove old single-break columns
ALTER TABLE "Tournament" DROP COLUMN IF EXISTS "breakAfterLevel";
ALTER TABLE "Tournament" DROP COLUMN IF EXISTS "breakDurationMinutes";

-- Add new breaks JSON column
ALTER TABLE "Tournament" ADD COLUMN "breaks" TEXT;

-- Add tax fields
ALTER TABLE "Tournament" ADD COLUMN "buyInTaxAmount"  DECIMAL(10,2);
ALTER TABLE "Tournament" ADD COLUMN "buyInTaxChips"   INTEGER;
ALTER TABLE "Tournament" ADD COLUMN "rebuyTaxAmount"  DECIMAL(10,2);
ALTER TABLE "Tournament" ADD COLUMN "rebuyTaxChips"   INTEGER;
ALTER TABLE "Tournament" ADD COLUMN "addonTaxAmount"  DECIMAL(10,2);
ALTER TABLE "Tournament" ADD COLUMN "addonTaxChips"   INTEGER;
