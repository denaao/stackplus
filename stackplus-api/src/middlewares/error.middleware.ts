import { Request, Response, NextFunction } from 'express'

export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('[ERROR]', err.message)
  res.status(500).json({ error: err.message || 'Erro interno do servidor' })
}
