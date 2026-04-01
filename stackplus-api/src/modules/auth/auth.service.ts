import { prisma } from '../../lib/prisma'
import { hashPassword, comparePassword } from '../../utils/hash'
import { signToken } from '../../utils/jwt'
import { PixKeyType, Role } from '@prisma/client'

export async function register(data: {
  name: string
  email: string
  phone?: string
  password: string
  pixType: PixKeyType
  pixKey: string
  role?: Role
}) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } })
  if (existing) throw new Error('Email já cadastrado')

  const passwordHash = await hashPassword(data.password)
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone?.trim() || null,
      pixType: data.pixType,
      pixKey: data.pixKey.trim(),
      passwordHash,
      role: data.role || Role.PLAYER,
    },
    select: { id: true, name: true, email: true, phone: true, pixType: true, pixKey: true, role: true, createdAt: true },
  })

  const token = signToken({ userId: user.id, email: user.email, role: user.role })
  return { user, token }
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new Error('Credenciais inválidas')

  const valid = await comparePassword(password, user.passwordHash)
  if (!valid) throw new Error('Credenciais inválidas')

  const token = signToken({ userId: user.id, email: user.email, role: user.role })
  const { passwordHash, ...safeUser } = user
  return { user: safeUser, token }
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, pixType: true, pixKey: true, role: true, avatarUrl: true, createdAt: true },
  })
  return user
}

export async function updateMe(userId: string, data: {
  name?: string
  phone?: string | null
  pixType?: PixKeyType
  pixKey?: string
}) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.phone !== undefined ? { phone: data.phone?.trim() || null } : {}),
      ...(data.pixType !== undefined ? { pixType: data.pixType } : {}),
      ...(data.pixKey !== undefined ? { pixKey: data.pixKey.trim() } : {}),
    },
    select: { id: true, name: true, email: true, phone: true, pixType: true, pixKey: true, role: true, avatarUrl: true, createdAt: true },
  })
  return user
}
