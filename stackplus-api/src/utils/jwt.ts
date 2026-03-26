import jwt from 'jsonwebtoken'

export interface JwtPayload {
  userId: string
  email: string
  role: string
}

export function signToken(payload: JwtPayload): string {
  const secret = process.env.JWT_SECRET as string
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d'
  return jwt.sign(payload, secret, { expiresIn })
}

export function verifyToken(token: string): JwtPayload {
  const secret = process.env.JWT_SECRET as string
  return jwt.verify(token, secret) as JwtPayload
}
