CREATE TYPE "FinancialModule" AS ENUM ('POSTPAID', 'PREPAID', 'HYBRID');
CREATE TYPE "MemberPaymentMode" AS ENUM ('POSTPAID', 'PREPAID');

ALTER TABLE "HomeGame"
ADD COLUMN "financialModule" "FinancialModule" NOT NULL DEFAULT 'POSTPAID';

ALTER TABLE "HomeGameMember"
ADD COLUMN "paymentMode" "MemberPaymentMode";

UPDATE "HomeGameMember" hm
SET "paymentMode" = 'POSTPAID'
WHERE "paymentMode" IS NULL;