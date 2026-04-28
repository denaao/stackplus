import { prisma } from '../../lib/prisma'
import { hashPassword, comparePassword } from '../../utils/hash'
import { signToken } from '../../utils/jwt'
import { emitRefreshTokenForUser, revokeAllForUser, rotateRefreshToken } from '../../lib/refresh-token'
import { DocumentType, PixKeyType, Role } from '@prisma/client'

const USER_SAFE_SELECT = {
  id: true, name: true, cpf: true, email: true, phone: true,
  documentType: true, documentNumber: true,
  pixType: true, pixKey: true, role: true, createdAt: true,
} as const

type RegisterCpfInput = {
  documentType: 'CPF'
  cpf: string
  name: string
  email?: string
  phone?: string
  password: string
  pixType: PixKeyType
  pixKey: string
}

type RegisterPassportInput = {
  documentType: 'PASSPORT'
  passportNumber: string
  nationality: string
  name: string
  email?: string
  phone?: string
  password: string
  pixType?: PixKeyType
  pixKey?: string
}

export async function register(data: RegisterCpfInput | RegisterPassportInput) {
  const email = data.email?.trim().toLowerCase() || null
  if (email) {
    const emailInUse = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (emailInUse) throw new Error('Email já cadastrado')
  }

  const passwordHash = await hashPassword(data.password)

  if (data.documentType === 'CPF') {
    const cpfDigits = data.cpf.replace(/\D/g, '')
    const cpfInUse = await prisma.user.findUnique({ where: { cpf: cpfDigits }, select: { id: true } })
    if (cpfInUse) throw new Error('CPF já cadastrado')

    const user = await prisma.user.create({
      data: {
        name: data.name.trim(),
        cpf: cpfDigits,
        documentType: DocumentType.CPF,
        documentNumber: cpfDigits,
        email,
        phone: data.phone?.trim() || null,
        pixType: data.pixType,
        pixKey: data.pixKey.trim(),
        passwordHash,
        role: Role.PLAYER,
      },
      select: USER_SAFE_SELECT,
    })

    const token = signToken({ userId: user.id, email: user.email ?? '', role: user.role })
    const refresh = await emitRefreshTokenForUser({ userId: user.id })
    return { user, token, refreshToken: refresh.token, refreshTokenExpiresAt: refresh.expiresAt }
  }

  // PASSPORT
  const passportNormalized = data.passportNumber.trim().toUpperCase()
  const passportInUse = await prisma.user.findUnique({
    where: { documentType_documentNumber: { documentType: DocumentType.PASSPORT, documentNumber: passportNormalized } },
    select: { id: true },
  })
  if (passportInUse) throw new Error('Passaporte já cadastrado')

  const user = await prisma.user.create({
    data: {
      name: data.name.trim(),
      cpf: null,
      documentType: DocumentType.PASSPORT,
      documentNumber: passportNormalized,
      email,
      phone: data.phone?.trim() || null,
      pixType: data.pixType ?? null,
      pixKey: data.pixKey?.trim() ?? null,
      passwordHash,
      role: Role.PLAYER,
    },
    select: USER_SAFE_SELECT,
  })

  const token = signToken({ userId: user.id, email: user.email ?? '', role: user.role })
  const refresh = await emitRefreshTokenForUser({ userId: user.id })
  return { user, token, refreshToken: refresh.token, refreshTokenExpiresAt: refresh.expiresAt }
}

export async function login(
  cpf: string,
  password: string,
  context?: { ip?: string | null; userAgent?: string | null },
) {
  const cpfDigits = cpf.replace(/\D/g, '')
  const user = await prisma.user.findUnique({ where: { cpf: cpfDigits } })
  if (!user) throw new Error('Credenciais inválidas')

  const valid = await comparePassword(password, user.passwordHash)
  if (!valid) throw new Error('Credenciais inválidas')

  const token = signToken({ userId: user.id, email: user.email ?? '', role: user.role })
  const refresh = await emitRefreshTokenForUser({
    userId: user.id,
    ip: context?.ip ?? null,
    userAgent: context?.userAgent ?? null,
  })
  const { passwordHash, ...safeUser } = user
  return {
    user: safeUser,
    token,
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
  }
}

export async function loginByPassport(
  passportNumber: string,
  password: string,
  context?: { ip?: string | null; userAgent?: string | null },
) {
  const passportNormalized = passportNumber.trim().toUpperCase()
  const user = await prisma.user.findUnique({
    where: { documentType_documentNumber: { documentType: DocumentType.PASSPORT, documentNumber: passportNormalized } },
  })
  if (!user) throw new Error('Credenciais inválidas')

  const valid = await comparePassword(password, user.passwordHash)
  if (!valid) throw new Error('Credenciais inválidas')

  const token = signToken({ userId: user.id, email: user.email ?? '', role: user.role })
  const refresh = await emitRefreshTokenForUser({
    userId: user.id,
    ip: context?.ip ?? null,
    userAgent: context?.userAgent ?? null,
  })
  const { passwordHash, ...safeUser } = user
  return {
    user: safeUser,
    token,
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
  }
}

/**
 * Troca um refresh token válido por um par novo (access + refresh).
 * Revoga o refresh antigo atomicamente.
 */
export async function refreshSession(
  rawRefreshToken: string,
  context?: { ip?: string | null; userAgent?: string | null },
) {
  const rotated = await rotateRefreshToken({
    rawToken: rawRefreshToken,
    ip: context?.ip ?? null,
    userAgent: context?.userAgent ?? null,
  })
  if (!rotated) throw new Error('Refresh token inválido ou expirado')

  const user = await prisma.user.findUnique({
    where: { id: rotated.userId },
    select: { id: true, email: true, role: true },
  })
  if (!user) throw new Error('Usuário não encontrado')

  const accessToken = signToken({ userId: user.id, email: user.email ?? '', role: user.role })
  return {
    token: accessToken,
    refreshToken: rotated.newToken,
    refreshTokenExpiresAt: rotated.newExpiresAt,
  }
}

/**
 * Logout: revoga todos os refresh tokens ativos do usuário.
 * Access tokens continuam válidos até expirar (15min) — trade-off de
 * performance vs segurança. Se precisar matar sessão imediatamente, adicionar
 * blacklist de access tokens (custa lookup em cada request).
 */
export async function logout(userId: string) {
  const revoked = await revokeAllForUser(userId)
  return { revoked }
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, cpf: true, email: true, phone: true, pixType: true, pixKey: true, role: true, avatarUrl: true, createdAt: true },
  })
  return user
}

export async function updateMe(userId: string, data: {
  name?: string
  cpf?: string
  email?: string | null
  phone?: string | null
  pixType?: PixKeyType
  pixKey?: string
}) {
  if (data.cpf !== undefined) {
    const cpfDigits = data.cpf.replace(/\D/g, '')
    const cpfInUse = await prisma.user.findFirst({ where: { cpf: cpfDigits, id: { not: userId } }, select: { id: true } })
    if (cpfInUse) throw new Error('CPF já cadastrado')
    data = { ...data, cpf: cpfDigits }
  }

  const email = data.email === undefined ? undefined : (data.email?.trim().toLowerCase() || null)
  if (email) {
    const emailInUse = await prisma.user.findFirst({ where: { email, id: { not: userId } }, select: { id: true } })
    if (emailInUse) throw new Error('Email já cadastrado')
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.cpf !== undefined ? { cpf: data.cpf } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
      ...(data.pixType !== undefined ? { pixType: data.pixType } : {}),
      ...(data.pixKey !== undefined ? { pixKey: data.pixKey.trim() } : {}),
    },
    select: { id: true, name: true, cpf: true, email: true, phone: true, pixType: true, pixKey: true, role: true, avatarUrl: true, createdAt: true },
  })
  return user
}

export async function loginEventSangeur(eventId: string, cpf: string, password: string) {
  const cpfDigits = cpf.replace(/\D/g, '')

  const user = await prisma.user.findFirst({ where: { cpf: cpfDigits } })
  if (!user) throw new Error('Credenciais inválidas')

  const valid = await comparePassword(password, user.passwordHash)
  if (!valid) throw new Error('Credenciais inválidas')

  const access = await prisma.eventSangeurAccess.findFirst({
    where: { eventId, userId: user.id, isActive: true },
    include: { event: { select: { id: true, name: true } } },
  })

  if (!access) throw new Error('Acesso de SANGEUR não encontrado ou inativo para este Evento')

  await prisma.eventSangeurAccess.update({
    where: { id: access.id },
    data: { lastLoginAt: new Date() },
  })

  const token = signToken({ userId: user.id, email: user.email ?? '', role: user.role })
  const { passwordHash, ...safeUser } = user

  return {
    token,
    user: safeUser,
    sangeur: {
      eventId: access.event.id,
      eventName: access.event.name,
    },
  }
}

export async function loginSangeur(homeGameId: string, cpf: string, password: string) {
  const cpfDigits = cpf.replace(/\D/g, '')

  // Autentica pela conta StackPlus do usuário (CPF + senha principal)
  const user = await prisma.user.findFirst({
    where: { cpf: cpfDigits },
  })

  if (!user) throw new Error('Credenciais inválidas')

  const valid = await comparePassword(password, user.passwordHash)
  if (!valid) throw new Error('Credenciais inválidas')

  // Verifica se o usuário tem acesso de sangeur ativo neste home game
  const access = await prisma.homeGameSangeurAccess.findUnique({
    where: { homeGameId_userId: { homeGameId, userId: user.id } },
    include: { homeGame: { select: { id: true, name: true } } },
  })

  if (!access || !access.isActive) {
    throw new Error('Acesso de SANGEUR não encontrado ou inativo para este Home Game')
  }

  await prisma.homeGameSangeurAccess.update({
    where: { homeGameId_userId: { homeGameId, userId: user.id } },
    data: { lastLoginAt: new Date() },
  })

  const token = signToken({
    userId: user.id,
    email: user.email ?? '',
    role: user.role,
  })

  const { passwordHash, ...safeUser } = user

  return {
    token,
    user: safeUser,
    sangeur: {
      homeGameId: access.homeGame.id,
      homeGameName: access.homeGame.name,
    },
  }
}

/**
 * Troca a senha do próprio usuário logado. Exige a senha atual pra confirmar.
 */
export async function changeUserPassword(input: {
  userId: string
  currentPassword: string
  newPassword: string
}) {
  if (input.newPassword.length < 6) {
    throw new Error('Nova senha deve ter pelo menos 6 caracteres')
  }
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { passwordHash: true },
  })
  const ok = await comparePassword(input.currentPassword, user.passwordHash)
  if (!ok) throw new Error('Senha atual inválida')

  const newHash = await hashPassword(input.newPassword)
  await prisma.user.update({
    where: { id: input.userId },
    data: { passwordHash: newHash },
  })
  return { success: true }
}

export async function changeSangeurPassword(input: {
  userId: string
  homeGameId: string
  currentPassword: string
  newPassword: string
}) {
  const access = await prisma.homeGameSangeurAccess.findUnique({
    where: {
      homeGameId_userId: {
        homeGameId: input.homeGameId,
        userId: input.userId,
      },
    },
  })

  if (!access || !access.isActive) throw new Error('Acesso SANGEUR não encontrado')

  const valid = await comparePassword(input.currentPassword, access.passwordHash)
  if (!valid) throw new Error('Senha atual inválida')

  const newPasswordHash = await hashPassword(input.newPassword)
  await prisma.homeGameSangeurAccess.update({
    where: {
      homeGameId_userId: {
        homeGameId: input.homeGameId,
        userId: input.userId,
      },
    },
    data: {
      passwordHash: newPasswordHash,
      mustChangePassword: false,
    },
  })

  return { success: true }
}
