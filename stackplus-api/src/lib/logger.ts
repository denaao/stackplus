import pino from 'pino'

/**
 * Logger estruturado do backend (QUAL-005).
 *
 * Em produção (NODE_ENV=production): saída JSON line-delimited, compatível
 * com Railway/Datadog/Loki. Cada log tem level, time ISO, pid, correlationId
 * (quando vem de request via pino-http), e campos custom do call site.
 *
 * Em dev: saída colorida via pino-pretty pra facilitar leitura local.
 *
 * Preferir sempre logger.info/warn/error em vez de console.* pra garantir
 * campos estruturados e capturar contexto da request (via pino-http).
 */
const isProd = process.env.NODE_ENV === 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  base: {
    service: 'stackplus-api',
  },
  redact: {
    // Nunca logar campos sensíveis mesmo se acidentalmente caírem no log.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-annapay-webhook-secret"]',
      'req.headers["x-webhook-secret"]',
      '*.password',
      '*.passwordHash',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname,service',
          },
        },
      }),
})
