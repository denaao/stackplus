ALTER TABLE "Session"
ADD COLUMN "financialModule" "FinancialModule" NOT NULL DEFAULT 'POSTPAID';

UPDATE "Session" s
SET "financialModule" = hg."financialModule"
FROM "HomeGame" hg
WHERE hg."id" = s."homeGameId";
