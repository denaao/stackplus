-- SEC-008: tabela AuditLog para trilha de auditoria de operações
-- financeiras, administrativas e de segurança.
--
-- Uso esperado: logAudit(...) é chamado em pontos críticos do código
-- (delete, transfer, PIX out, mudança de papel, etc). Queries forenses
-- filtram por userId, action, resource ou createdAt.
--
-- userId é nullable pra eventos de sistema (cron, webhooks externos).
-- metadata usa jsonb pra flexibilidade sem mudança de schema.

CREATE TABLE "AuditLog" (
  "id"         TEXT PRIMARY KEY,
  "userId"     TEXT,
  "action"     TEXT NOT NULL,
  "resource"   TEXT NOT NULL,
  "resourceId" TEXT,
  "metadata"   JSONB,
  "ip"         TEXT,
  "userAgent"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
