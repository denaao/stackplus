-- Add reversalOfId to ComandaItem for non-destructive rollback support
ALTER TABLE "ComandaItem" ADD COLUMN "reversalOfId" TEXT;
ALTER TABLE "ComandaItem" ADD CONSTRAINT "ComandaItem_reversalOfId_key" UNIQUE ("reversalOfId");
ALTER TABLE "ComandaItem" ADD CONSTRAINT "ComandaItem_reversalOfId_fkey"
  FOREIGN KEY ("reversalOfId") REFERENCES "ComandaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
