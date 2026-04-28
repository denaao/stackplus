import { prisma } from '../../lib/prisma'
import { generateJoinCode } from '../../utils/codeGenerator'
import { FinancialModule, EventStatus } from '@prisma/client'
import { assertEventHost, isEventHost } from '../../lib/event-auth'

// ─── helpers ──────────────────────────────────────────────────────────────────

async function generateAccessCode(): Promise<string> {
  let code = generateJoinCode()
  let tries = 0
  while (tries < 10) {
    const exists = await prisma.event.findUnique({ where: { accessCode: code } })
    if (!exists) break
    code = generateJoinCode()
    tries++
  }
  return code
}

const EVENT_INCLUDE = {
  host: { select: { id: true, name: true, email: true } },
  staff: {
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  _count: { select: { sessions: true, comandas: true } },
} as const

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createEvent(hostId: string, data: {
  name: string
  description?: string
  venue?: string
  startDate: Date
  endDate: Date
  registrationOpenAt?: Date
  registrationCloseAt?: Date
  isPublic?: boolean
  financialModule?: FinancialModule
  chipValue: number
}) {
  const accessCode = data.isPublic === false ? await generateAccessCode() : undefined

  return prisma.event.create({
    data: {
      ...data,
      hostId,
      financialModule: data.financialModule ?? FinancialModule.POSTPAID,
      status: EventStatus.DRAFT,
      bankBalance: 0,
      accessCode,
    },
    include: EVENT_INCLUDE,
  })
}

export async function getEventById(id: string) {
  return prisma.event.findUniqueOrThrow({
    where: { id },
    include: EVENT_INCLUDE,
  })
}

export async function getEventByIdForUser(id: string, userId: string) {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id },
    include: EVENT_INCLUDE,
  })

  // Evento publico: qualquer usuario autenticado pode ver.
  if (event.isPublic) return event

  // Evento privado: apenas host, staff, ou quem tem comanda.
  const isHost = await isEventHost(userId, id)
  if (isHost) return event

  const hasComanda = await prisma.comanda.findFirst({
    where: { eventId: id, playerId: userId },
    select: { id: true },
  })
  if (hasComanda) return event

  throw new Error('Acesso negado')
}

export async function listMyEvents(userId: string) {
  const [asHost, asStaff] = await Promise.all([
    prisma.event.findMany({
      where: { hostId: userId },
      include: EVENT_INCLUDE,
      orderBy: { startDate: 'desc' },
    }),
    prisma.eventStaff.findMany({
      where: { userId },
      include: {
        event: { include: EVENT_INCLUDE },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  // Evita duplicatas: se o usuario e host e tambem tem EventStaff, aparece so em asHost.
  const hostIds = new Set(asHost.map((e) => e.id))
  const asStaffEvents = asStaff
    .filter((s) => !hostIds.has(s.eventId))
    .map((s) => ({ ...s.event, myRole: s.role }))

  return {
    asHost,
    asStaff: asStaffEvents,
  }
}

export async function listPublicEvents(filters?: {
  status?: EventStatus
  from?: Date
  to?: Date
}) {
  return prisma.event.findMany({
    where: {
      isPublic: true,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.from || filters?.to
        ? {
            startDate: {
              ...(filters?.from ? { gte: filters.from } : {}),
              ...(filters?.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
    include: {
      host: { select: { id: true, name: true } },
      _count: { select: { sessions: true, comandas: true } },
    },
    orderBy: { startDate: 'asc' },
  })
}

export async function updateEvent(eventId: string, requesterId: string, data: {
  name?: string
  description?: string
  venue?: string
  startDate?: Date
  endDate?: Date
  registrationOpenAt?: Date
  registrationCloseAt?: Date
  isPublic?: boolean
  chipValue?: number
}) {
  await assertEventHost(requesterId, eventId)

  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { status: true },
  })

  const LOCKED_STATUSES: EventStatus[] = [EventStatus.FINISHED, EventStatus.CANCELED]
  if (LOCKED_STATUSES.includes(event.status)) {
    throw new Error('Evento finalizado ou cancelado nao pode ser editado')
  }

  return prisma.event.update({
    where: { id: eventId },
    data,
    include: EVENT_INCLUDE,
  })
}

// ─── Status transitions ───────────────────────────────────────────────────────

function assertStatusTransition(current: EventStatus, next: EventStatus) {
  const allowed: Record<EventStatus, EventStatus[]> = {
    DRAFT:       [EventStatus.OPEN, EventStatus.IN_PROGRESS, EventStatus.CANCELED],
    OPEN:        [EventStatus.IN_PROGRESS, EventStatus.CANCELED],
    IN_PROGRESS: [EventStatus.FINISHED, EventStatus.CANCELED],
    FINISHED:    [],
    CANCELED:    [],
  }
  if (!allowed[current]?.includes(next)) {
    throw new Error(`Transicao de status invalida: ${current} -> ${next}`)
  }
}

async function transitionEventStatus(eventId: string, requesterId: string, next: EventStatus) {
  await assertEventHost(requesterId, eventId)
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { status: true },
  })
  assertStatusTransition(event.status, next)
  return prisma.event.update({
    where: { id: eventId },
    data: { status: next },
    include: EVENT_INCLUDE,
  })
}

export async function openEvent(eventId: string, requesterId: string) {
  return transitionEventStatus(eventId, requesterId, EventStatus.OPEN)
}

export async function startEvent(eventId: string, requesterId: string) {
  return transitionEventStatus(eventId, requesterId, EventStatus.IN_PROGRESS)
}

export async function finishEvent(eventId: string, requesterId: string) {
  return transitionEventStatus(eventId, requesterId, EventStatus.FINISHED)
}

export async function cancelEvent(eventId: string, requesterId: string) {
  return transitionEventStatus(eventId, requesterId, EventStatus.CANCELED)
}

// ─── Access code ──────────────────────────────────────────────────────────────

export async function getEventByAccessCode(accessCode: string) {
  const event = await prisma.event.findUnique({
    where: { accessCode },
    include: {
      host: { select: { id: true, name: true } },
      _count: { select: { sessions: true, comandas: true } },
    },
  })
  if (!event) throw new Error('Código de acesso inválido')
  return event
}

export async function rotateAccessCode(eventId: string, requesterId: string) {
  await assertEventHost(requesterId, eventId)
  const accessCode = await generateAccessCode()
  return prisma.event.update({
    where: { id: eventId },
    data: { accessCode },
    select: { id: true, accessCode: true },
  })
}
