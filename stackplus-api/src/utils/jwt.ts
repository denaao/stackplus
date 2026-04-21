import jwt from 'jsonwebtoken'

export interface JwtPayload {
  userId: string
  email: string
  role: string
}

/**
 * Access token: vida curta (default 15min). Migração SEC-004 usa refresh
 * token pra renovar silenciosamente sem forçar re-login.
 *
 * Compatibilidade: JWT_EXPIRES_IN (legado, default 7d) ainda funciona se
 * ACCESS_TOKEN_TTL não for definido. Isso garante que deploy não desloga
 * usuários com tokens ainda válidos.
 */
export function signToken(payload: JwtPayload): string {
  const secret = process.env.JWT_SECRET as string
  const expiresIn = process.env.ACCESS_TOKEN_TTL || process.env.JWT_EXPIRES_IN || '15m'
  return jwt.sign(payload, secret, { expiresIn: expiresIn as unknown as number })
}

export function verifyToken(token: string): JwtPayload {
  const secret = process.env.JWT_SECRET as string
  return jwt.verify(token, secret) as JwtPayload
}
