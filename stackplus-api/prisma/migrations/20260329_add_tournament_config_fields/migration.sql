ALTER TABLE "HomeGame"
ADD COLUMN "buyInAmount" DECIMAL(10,2),
ADD COLUMN "rebuyAmount" DECIMAL(10,2),
ADD COLUMN "addOnAmount" DECIMAL(10,2),
ADD COLUMN "blindsMinutesBeforeBreak" INTEGER,
ADD COLUMN "blindsMinutesAfterBreak" INTEGER,
ADD COLUMN "levelsUntilBreak" INTEGER;
