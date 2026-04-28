import { prisma } from '../../lib/prisma'
import { hashPassword } from '../../utils/hash'
import { randomBytes } from 'crypto'
import { assertEventHost } from '../../lib/event-auth'
import QRCode from 'qrcode'

function slugifyName(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '')
    .slice(0, 40)
}

async function buildLoginQrCode(eventId: string, username: string): Promise<string> {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim()
  const url = `${frontendUrl}/sangeur/tournament/login?eventId=${eventId}&username=${encodeURIComponent(username)}`
  return QRCode.toDataURL(url, { width: 300, margin: 2 })
}

async function buildActivationQrCode(token: string): Promise<string> {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  const url = `${frontendUrl}/sangeur/ativar?token=${token}`
  return QRCode.toDataURL(url, { width: 300, margin: 2 })
}

const ACCESS_SELECT = {
  id: true,
  eventId: true,
  userId: true,
  username: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, email: true } },
} as const

export async function getLoginQr(eventId: string, requesterId: string, memberUserId: string) {
  await assertEventHost(requesterId, eventId)
  const access = await prisma.eventSangeurAccess.findUniqueOrThrow({
    where: { eventId_userId: { eventId, userId: memberUserId } },
    select: { username: true },
  })
  const qrCode = await buildLoginQrCode(eventId, access.username)
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  const loginUrl = `${frontendUrl}/sangeur/tournament/login?eventId=${eventId}&username=${encodeURIComponent(access.username)}`
  return { qrCode, loginUrl, username: access.username }
}

export async function listEventSangeurAccesses(eventId: string, requesterId: string) {
  await assertEventHost(requesterId, eventId)
  return prisma.eventSangeurAccess.findMany({
    where: { eventId },
    select: ACCESS_SELECT,
    orderBy: { createdAt: 'desc' },
  })
}

export async function enableEventSangeurAccess(input: {
  eventId: string
  hostId: string
  memberUserId: string
  username?: string
}) {
  await assertEventHost(input.hostId, input.eventId)

  // Qualquer usuario registrado pode ser sangeur de evento (nao precisa ser membro)
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: input.memberUserId },
    select: { name: true },
  })

  let normalizedUsername: string
  if (input.username?.trim()) {
    normalizedUsername = input.username.trim().toLowerCase()
  } else {
    const base = slugifyName(user.name) || 'sangeur'
    const existing = await prisma.eventSangeurAccess.findMany({
      where: { eventId: input.eventId },
      select: { username: true },
    })
    const taken = new Set(existing.map((a) => a.username))
    normalizedUsername = base
    let suffix = 2
    while (taken.has(normalizedUsername)) normalizedUsername = `${base}${suffix++}`
  }

  const placeholderHash = await hashPassword(randomBytes(32).toString('hex'))

  const access = await prisma.eventSangeurAccess.upsert({
    where: { eventId_userId: { eventId: input.eventId, userId: input.memberUserId } },
    update: {
      username: normalizedUsername,
      isActive: true,
      mustChangePassword: false,
      activationToken: null,
      activationTokenExpiresAt: null,
    },
    create: {
      eventId: input.eventId,
      userId: input.memberUserId,
      username: normalizedUsername,
      passwordHash: placeholderHash,
      isActive: true,
      mustChangePassword: false,
    },
    select: ACCESS_SELECT,
  })

  const loginQrCode = await buildLoginQrCode(input.eventId, access.username)
  return { access, activationQrCode: loginQrCode, isLoginQr: true }
}

export async function enableExistingEventSangeurAccess(eventId: string, requesterId: string, memberUserId: string) {
  await assertEventHost(requesterId, eventId)
  return prisma.eventSangeurAccess.update({
    where: { eventId_userId: { eventId, userId: memberUserId } },
    data: { isActive: true },
    select: ACCESS_SELECT,
  })
}

export async function disableEventSangeurAccess(eventId: string, requesterId: string, memberUserId: string) {
  await assertEventHost(requesterId, eventId)
  return prisma.eventSangeurAccess.update({
    where: { eventId_userId: { eventId, userId: memberUserId } },
    data: { isActive: false },
    select: ACCESS_SELECT,
  })
}

export async function resetEventSangeurPassword(input: {
  eventId: string
  hostId: string
  memberUserId: string
}) {
  await assertEventHost(input.hostId, input.eventId)

  const activationToken = randomB