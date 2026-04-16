import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/jwt'
import { prisma } from '../lib/prisma'

export interface AuthRequest extends Request {
  user?: {
    userId: string
    email: string
    role: string
  }
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token não fornecido' })
    return
  }
  const token = authHeader.split(' ')[1]
  try {
    const decoded = verifyToken(token)
    const dbUser = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true },
    })

    if (!dbUser) {
      res.status(401).json({ error: 'Token inválido ou expirado' })
      return
    }

    req.user = {
      userId: dbUser.id,
      email: dbUser.email ?? '',
      role: dbUser.role,
    }

    next()
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' })
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Acesso negado' })
      return
    }
    next()
  }
}
