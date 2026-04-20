import { prisma } from './prisma'
import { logger } from './logger'

/**
 * Helper para registrar evento de auditoria (SEC-008).
 *
 * Use em pontos críticos do código: delete, transfer, PIX out, mudança de
 * papel/permissão, operações administrativas. Registros são imutáveis.
 *
 * Falha silenciosa — se o log der erro (DB down, schema mismatch), loga no
 * console mas NÃO propaga exception pro caller. O objetivo é não quebrar o
 * fluxo principal por causa da auditoria.
 *
 * Exemplo:
 *   await logAudit({
 *     userId: req.user.userId,
 *     action: 'TRANSACTION_DELETE',
 *     resource: 'Transaction',
 *     resourceId: tx.id,
 *     metadata: { sessionId: tx.sessionId, amount: tx.amount },
 *     ip: req.ip,
 *     userAgent: req.headers['user-agent'],
 *   })
 */
export async function logAudit(params: {
  userId?: string | null
  action: string
  resource: string
  resourceId?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any> | null
  ip?: string | null
  userAgent?: string | null
}): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId ?? null,
        metadata: params.metadata ?? null,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
      },
    })
  } catch (error) {
    logger.error(
      {
        action: params.action,
        resource: params.resource,
        err: error instanceof Error ? error.message : String(error),
      },
      '[audit] falha ao gravar registro de auditoria',
    )
  }
}
