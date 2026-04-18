import { prisma } from '../../lib/prisma'
import { hashPassword, comparePassword } from '../../utils/hash'
import { signToken } from '../../utils/jwt'
import { PixKeyType, Role } from '@prisma/client'

export async function register(data: {
  name: string
  cpf: string
  email?: string
  phone?: string
  password: string
  pixType: PixKeyType
  pixKey: string
}) {
  const cpfDigits = data.cpf.replace(/\D/g, '')
  const cpfInUse = await prisma.user.findUnique({ where: { cpf: cpfDigits }, select: { id: true } })
  if (cpfInUse) throw new Error('CPF já cadastrado')

  const email = data.email?.trim().toLowerCase() || null
  if (email) {
    const emailInUse = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (emailInUse) throw new Error('Email já cadastrado')
  }

  const passwordHash = await hashPassword(data.password)
  const user = await prisma.user.create({
    data: {
      name: data.name.trim(),
      cpf: cpfDigits,
      email,
      phone: data.phone?.trim() || null,
      pixType: data.pixType,
      pixKey: data.pixKey.trim(),
      passwordHash,
      role: Role.PLAYER,
    },
    select: { id: true, name: true, cpf: true, email: true, phone: true, pixType: true, pixKey: true, role: true, createdAt: true },
  })

  const token = signToken({ userId: user.id, email: user.email ?? '', role: user.role })
  return { user, token }
}

export async function login(cpf: string, password: string) {
  const cpfDigits = cpf.replace(/\D/g, '')
  const user = await prisma.user.findUnique({ where: { cpf: cpfDigits } })
  if (!user) throw new Error('Credenciais inválidas')

  const valid = await comparePassword(password, user.passwordHash)
  if (!valid) throw new Error('Credenciais inválidas')

  const token = signToken({ userId: user.id, email: user.email ?? '', role: user.role })
  const { passwordHash, ...safeUser } = user
  return { user: safeUser, token }
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

export async function loginSangeur(homeGameId: string, username: string, password: string) {
  const normalizedUsername = username.trim().toLowerCase()

  const access = await prisma.homeGameSangeurAccess.findUnique({
    where: {
      homeGameId_username: {
        homeGameId,
        username: normalizedUsername,
      },
    },
    include: {
      user: true,
      homeGame: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  if (!access || !access.isActive) throw new Error('Credenciais inválidas')

  const valid = await comparePassword(password, access.passwordHash)
  if (!valid) throw new Error('Credenciais inválidas')

  await prisma.homeGameSangeurAccess.update({
    where: {
      homeGameId_userId: {
        homeGameId: access.homeGameId,
        userId: access.userId,
      },
    },
    data: {
      lastLoginAt: new Date(),
    },
  })

  const token = signToken({
    userId: access.user.id,
    email: access.user.email ?? '',
    role: access.user.role,
  })

  const { passwordHash, ...safeUser } = access.user

  return {
    token,
    user: safeUser,
    sangeur: {
      homeGameId: access.homeGame.id,
      homeGameName: access.homeGame.name,
      username: access.username,
      mustChangePassword: access.mustChangePassword,
    },
  }
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
