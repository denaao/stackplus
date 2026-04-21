/**
 * Integração com Sentry para captura de exceções em produção.
 *
 * Comportamento:
 * - Se SENTRY_DSN não estiver definido, as funções viram no-op (0 overhead).
 *   Isso permite rodar dev/CI sem configurar Sentry.
 * - Em produção (NODE_ENV=production), inicializa com sample rate de 100% para
 *   erros. Traces/profiling estão desligados por padrão (custo/ruído).
 * - Eventos são enriquecidos com `userId`, `requestId` e `route` quando a
 *   função `captureError` recebe o contexto do request.
 *
 * Uso típico (só no errorMiddleware; em outros pontos, prefira `logger.error`):
 *   import { captureError } from '../lib/sentry'
 *   captureError(err, { userId, requestId, route, status })
 */
import * as Sentry from '@sentry/node'

let initialized = false

export function initSentry() {
  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn) {
    // Sem DSN: fica em modo no-op. Não logar warning — é comportamento
    // esperado em dev/CI.
    return
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || process.env.RAILWAY_GIT_COMMIT_SHA,
    // Capturamos 100% dos erros. Para traces, exigiria instrumentação HTTP
    // mais pesada — melhor deixar desligado até ter necessidade real.
    tracesSampleRate: 0,
    // Não enviar dados de request headers por default — secrets já estão
    // redatados no pino mas o Sentry coleta o body bruto. Em caso de necessidade,
    // habilitar `sendDefaultPii: true` explicitamente.
    sendDefaultPii: false,
  })

  initialized = true
}

export function isSentryEnabled() {
  return initialized
}

interface ErrorContext {
  userId?: string
  requestId?: string
  route?: string
  status?: number
}

/**
 * Captura uma exceção no Sentry com contexto enriquecido.
 * No-op se Sentry não foi inicializado (sem DSN configurado).
 */
export function captureError(err: unknown, ctx: ErrorContext = {}) {
  if (!initialized) return

  Sentry.withScope((scope) => {
    if (ctx.userId) scope.setUser({ id: ctx.userId })
    if (ctx.requestId) scope.setTag('requestId', ctx.requestId)
    if (ctx.route) scope.setTag('route', ctx.route)
    if (ctx.status) scope.setTag('status', String(ctx.status))

    if (err instanceof Error) {
      Sentry.captureException(err)
    } else {
      Sentry.captureMessage(typeof err === 'string' ? err : JSON.stringify(err), 'error')
    }
  })
}

/**
 * Fecha o cliente Sentry drenando eventos pendentes. Chamar no shutdown do
 * processo (SIGTERM/SIGINT) para evitar perder exceções de último segundo.
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return
  try {
    await Sentry.close(timeoutMs)
  } catch {
    // Best-effort — se o flush falhar, não bloqueia shutdown.
  }
}
