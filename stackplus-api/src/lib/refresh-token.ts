/**
 * Refresh token helpers (SEC-004).
 *
 * Fluxo:
 *   1. Login → emitRefreshTokenForUser → devolve token cru (só uma vez)
 *   2. Cliente guarda o token cru; backend guarda só o hash
 *   3. /auth/refresh → rotateRefreshToken valida, revoga o antigo, emite novo
 *   4. Logout → revokeAllForUser marca todos como revoked
 *
 * Segurança:
 *   - Token cru = 256 bits de entropia random (crypto.randomBytes)
 *   - Hash SHA-256 hex no DB — se tabela vazar, tokens válidos não saem
 *   - Rotação: a cada refresh, emite novo e revoga o antigo (chain via
 *     replacedBy). Reutilização do antigo → detecção de roubo possível.
 */
import { randomBytes, createHash } from 'crypto'
import { prisma } from './prisma'

const REFRESH_TOKEN_BYTES = 32 // 256 bits de entropia
const DEFAULT_TTL_DAYS = 30

function ttlMs(): number {
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS || DEFAULT_TTL_DAYS)
  return days * 24 * 60 * 60 * 1000
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/**
 * Emite um novo refresh token para o user e persiste o hash no DB.
 * Retorna o token cru — precisa ser devolvido ao cliente e NUNCA logado.
 */
export async function emitRefreshTokenForUser(params: {
  userId: string
  ip?: string | null
  userAgent?: string | null
}): Promise<{ token: string; expiresAt: Date }> {
  const raw = randomBytes(REFRESH_TOKEN_BYTES).toString('hex')
  const tokenHash = hashToken(raw)
  const expiresAt = new Date(Date.now() + ttlMs())

  await prisma.refreshToken.create({
    data: {
      userId: params.userId,
      tokenHash,
      expiresAt,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
    },
  })

  return { token: raw, expiresAt }
}

/**
 * Valida um refresh token e, se OK, rotaciona: revoga o antigo e emite novo.
 * Retorna { userId, newToken, newExpiresAt } — ou null se token inválido/expirado/revogado.
 */
export async function rotateRefreshToken(params: {
  rawToken: string
  ip?: string | null
  userAgent?: string | null
}): Promise<{ userId: string; newToken: string; newExpiresAt: Date } | null> {
  const tokenHash = hashToken(params.rawToken)
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, revokedAt: true },
  })

  if (!existing) return null
  if (existing.revokedAt) return null
  if (existing.expiresAt < new Date()) return null

  // Emite novo
  const newRaw = randomBytes(REFRESH_TOKEN_BYTES).toString('hex')
  const newHash = hashToken(newRaw)
  const newExpiresAt = new Date(Date.now() + ttlMs())

  // Transação: revoga o antigo e cria o novo atomicamente.
  const created = await prisma.$transaction(async (tx) => {
    const novo = await tx.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: newHash,
        expiresAt: newExpiresAt,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
      },
    })
    await tx.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedBy: novo.id },
    })
    return novo
  })

  return {
    userId: created.userId,
    newToken: newRaw,
    newExpiresAt,
  }
}

/**
 * Revoga todos os refresh tokens ativos do usuário (logout).
 * Mantém registros históricos pra auditoria.
 */
export async function revokeAllForUser(userId: string): Promise<number> {
  const result = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return result.count
}
