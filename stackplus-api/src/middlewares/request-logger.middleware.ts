import pinoHttp from 'pino-http'
import { randomUUID } from 'crypto'
import { logger } from '../lib/logger'

/**
 * Middleware de log de request (QUAL-005).
 *
 * Gera um requestId UUID por request (reusa X-Request-Id do header se vier
 * do proxy/cliente), injeta em req.log e log cada request com duração e
 * status. Todos os logger.* chamados dentro do handler herdam o requestId
 * automaticamente via pino-http child logger.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const header = req.headers['x-request-id']
    const id = typeof header === 'string' && header ? header : randomUUID()
    res.setHeader('x-request-id', id)
    return id
  },
  // Pulamos healthchecks e assets pra não poluir o log.
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/favicon.ico',
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} -> ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} -> ${res.statusCode} | ${err.message}`,
})
