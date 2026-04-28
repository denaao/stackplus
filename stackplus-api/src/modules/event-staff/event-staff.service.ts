import { prisma } from '../../lib/prisma'
import { EventStaffRole } from '@prisma/client'
import { assertEventHost } from '../../lib/event-auth'

const STAFF_INCLUDE = {
  user: { select: { id: true, name: true, email: true, documentType: true, documentNumber: true } },
  event: { select: { id: true, name: true, status: true } },
} as const

export async function listStaff(eventId: string, requesterId: string) {
  await assertEventHost(requesterId, eventId)
  return prisma.eventStaff.findMany({
    where: { eventId },
    include: STAFF_INCLUDE,
    orderBy: { createdAt: 'asc' },
  })
}

export async function addStaff(eventId: string, requesterId: string, data: {
  userId: string
  role: EventStaffRole
}) {
  await assertEventHost(requesterId, eventId)

  // Verifica se o usuario existe
  const user = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { id: true, name: true },
  })
  if (!user) throw new Error('Usuario nao encontrado')

  // Um usuario nao pode ser staff de si mesmo (o host original ja e implicito)
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { hostId: true },
  })
  if (event.hostId === data.userId) {
    throw new Error('O host original do evento ja tem permissao total')
  }

  return prisma.eventStaff.create({
    data: { eventId, userId: data.userId, role: data.role },
    include: STAFF_INCLUDE,
  })
}

export async function updateStaffRole(eventId: string, staffId: string, requesterId: string, role: EventStaffRole) {
  await assertEventHost(requesterId, eventId)

  const staff = await prisma.eventStaff.findUnique({
    where: { id: staffId },
    select: { id: true, eventId: true },
  })
  if (!staff || staff.eventId !== eventId) throw new Error('Staff nao encontrado neste evento')

  return prisma.eventStaff.update({
    where: { id: staffId },
    data: { role },
    include: STAFF_INCLUDE,
  })
}

export async function removeStaff(eventId: string, staffId: string, requesterId: string) {
  await assertEventHost(requesterId, eventId)

  const staff = await prisma.eventStaff.findUnique({
    where: { id: staffId },
    select: { id: true, eventId: true },
  })
  if (!staff || staff.eventId !== eventId) throw new Error('Staff nao encontrado neste evento')

  await prisma.eventStaff.delete({ where: { id: staffId } })
}
