-- Migration: events_m6_permission_config
-- Adds TOURNAMENT_DIRECTOR and CASH_DIRECTOR to EventStaffRole enum
-- Adds EventPermissionKey enum
-- Creates EventPermissionConfig table for per-event role permission overrides

-- 1. Extend EventStaffRole enum
ALTER TYPE "EventStaffRole" ADD VALUE IF NOT EXISTS 'TOURNAMENT_DIRECTOR';
ALTER TYPE "EventStaffRole" ADD VALUE IF NOT EXISTS 'CASH_DIRECTOR';

-- 2. Create EventPermissionKey enum
DO $$ BEGIN
  CREATE TYPE "EventPermissionKey" AS ENUM (
    'CREATE_TOURNAMENT',
    'MANAGE_TOURNAMENT',
    'MANAGE_CASH_GAME',
    'VIEW_COMANDAS',
    'DAILY_CLOSE',
    'POS_TOURNAMENT',
    'POS_CASH',
    'CAIXINHA',
    'PONTO'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Create EventPermissionConfig table
CREATE TABLE IF NOT EXISTS "EventPermissionConfig" (
  "id"         TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "eventId"    TEXT        NOT NULL,
  "role"       "EventStaffRole"     NOT NULL,
  "permission" "EventPermissionKey" NOT NULL,
  "allowed"    BOOLEAN     NOT NULL DEFAULT true,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT now(),

  CONSTRAINT "EventPermissionConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventPermissionConfig_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE,
  CONSTRAINT "EventPermissionConfig_eventId_role_permission_key"
    UNIQUE ("eventId", "role", "permission")
);

CREATE INDEX IF NOT EXISTS "EventPermissionConfig_eventId_idx"
  ON "EventPermissionConfig"("eventId");

CREATE INDEX IF NOT EXISTS "EventPermissionConfig_eventId_role_idx"
  ON "EventPermissionConfig"("eventId", "role");
