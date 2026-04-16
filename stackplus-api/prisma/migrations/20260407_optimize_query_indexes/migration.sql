-- Performance indexes for high-frequency filters/orderings.
-- Safe migration: only CREATE INDEX IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS "Session_homeGameId_createdAt_idx"
ON "Session"("homeGameId", "createdAt");

CREATE INDEX IF NOT EXISTS "Session_homeGameId_status_finishedAt_idx"
ON "Session"("homeGameId", "status", "finishedAt");

CREATE INDEX IF NOT EXISTS "SangeurShift_sessionId_sangeurUserId_status_idx"
ON "SangeurShift"("sessionId", "sangeurUserId", "status");

CREATE INDEX IF NOT EXISTS "SangeurSale_paymentMethod_paymentReference_paymentStatus_idx"
ON "SangeurSale"("paymentMethod", "paymentReference", "paymentStatus");

CREATE INDEX IF NOT EXISTS "PlayerSessionState_userId_idx"
ON "PlayerSessionState"("userId");

CREATE INDEX IF NOT EXISTS "PlayerSessionState_userId_updatedAt_idx"
ON "PlayerSessionState"("userId", "updatedAt");

CREATE INDEX IF NOT EXISTS "PlayerSessionState_sessionId_result_idx"
ON "PlayerSessionState"("sessionId", "result");

CREATE INDEX IF NOT EXISTS "Transaction_sessionId_createdAt_idx"
ON "Transaction"("sessionId", "createdAt");

CREATE INDEX IF NOT EXISTS "Transaction_sessionId_userId_createdAt_idx"
ON "Transaction"("sessionId", "userId", "createdAt");

-- Rollback plan (manual, if needed):
-- DROP INDEX IF EXISTS "Session_homeGameId_createdAt_idx";
-- DROP INDEX IF EXISTS "Session_homeGameId_status_finishedAt_idx";
-- DROP INDEX IF EXISTS "SangeurShift_sessionId_sangeurUserId_status_idx";
-- DROP INDEX IF EXISTS "SangeurSale_paymentMethod_paymentReference_paymentStatus_idx";
-- DROP INDEX IF EXISTS "PlayerSessionState_userId_idx";
-- DROP INDEX IF EXISTS "PlayerSessionState_userId_updatedAt_idx";
-- DROP INDEX IF EXISTS "PlayerSessionState_sessionId_result_idx";
-- DROP INDEX IF EXISTS "Transaction_sessionId_createdAt_idx";
-- DROP INDEX IF EXISTS "Transaction_sessionId_userId_createdAt_idx";
