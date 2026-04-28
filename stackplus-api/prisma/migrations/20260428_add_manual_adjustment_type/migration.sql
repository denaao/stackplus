-- Replace MANUAL_ADJUSTMENT with MANUAL_CREDIT and MANUAL_DEBIT in ComandaItemType enum
-- (MANUAL_ADJUSTMENT was added but never used in production data)

ALTER TYPE "ComandaItemType" ADD VALUE IF NOT EXISTS 'MANUAL_CREDIT';
ALTER TYPE "ComandaItemType" ADD VALUE IF NOT EXISTS 'MANUAL_DEBIT';
