import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import { captureError } from '../lib/sentry'

function extractMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return 'Erro interno do servidor'
  }
}

function resolveStatus(err: unknown): number {
  const message = extractMessage(err)

  if (err instanceof ZodError) return 400

  if (err instanceof SyntaxError && message.includes('JSON')) return 400

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return 409
    if (err.code === 'P2025') return 404
    return 400
  }

  if (
    message.includes('não encontrada') ||
    message.includes('nao encontrada')
  ) return 404

  if (
    message.includes('Acesso negado') ||
    message.includes('Apenas o host')
  ) return 403

  if (
    message.includes('Token não fornecido') ||
    message.includes('Token inválido') ||
    message.includes('expirado')
  ) return 401

  if (message.includes('Credenciais inválidas')) return 401

  if (message.includes('Email já cadastrado')) return 409

    if (
      message.includes('ANNAPAY/ANNABANK fora do ar') ||
      message.includes('fora do ar no momento')
    ) return 503

  if (
    message.includes('não está ativa') ||
    message.includes('já iniciada') ||
    message.includes('pelo menos 2 participantes') ||
    message.includes('buy-in primeiro') ||
    message.includes('Buy-in já realizado') ||
    message.includes('já realizou cashout') ||
    message.includes('caixinha') ||
    message.includes('staff') ||
    message.includes('total de fichas em jogo') ||
    message.includes('maior que zero') ||
    message.includes('inválido')
  ) return 400

  return 500
}

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const status = resolveStatus(err)
  const message = extractMessage(err) || 'Erro interno do servidor'

  // Contexto do request — userId/role se autenticado, IP pra rastrear anônimos.
  const authUser = (req as Request & { user?: { userId?: string; role?: string } }).user
  const userId = authUser?.userId ?? 'anonymous'
  const userRole = authUser?.role ?? '-'

  // req.log vem do pino-http (middleware requestLogger) com requestId injetado.
  // Fallback pra console se por algum motivo não existir.
  const log =
    (req as Request & { log?: { error: (obj: object, msg: string) => void } }).log ?? {
      error: (obj: object, msg: string) => console.error(msg, obj),
    }

  log.error(
    {
      status,
      userId,
      role: userRole,
      errorName: err instanceof Error ? err.name : undefined,
      stack: err instanceof Error ? err.stack : undefined,
    },
    message,
  )

  // Sentry: capturamos apenas erros 500+. Erros 4xx sao comportamento esperado
  // (input invalido do user, 401/403/404 etc) e geram ruido se forem reportados.
  if (status >= 500) {
    const requestId = (req.headers['x-request-id'] as string | undefined)
      ?? (req as Request & { id?: string }).id
    captureError(err, {
      userId: authUser?.userId,
      requestId,
      route: `${req.method} ${req.route?.path ?? req.path}`,
      status,
    })
  }

  if (err instanceof ZodError) {
    res.status(status).json({
      error: 'Dados inválidos',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
    return
  }

  res.status(status).json({ error: message })
}
