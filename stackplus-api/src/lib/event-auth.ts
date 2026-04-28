import { prisma } from './prisma'
import { EventStaffRole, EventPermissionKey } from '@prisma/client'

// ---------------------------------------------------------------------------
// Default permission matrix — applies when no EventPermissionConfig override
// exists for a given (event, role, permission) triple.
// HOST always passes regardless of config.
// ---------------------------------------------------------------------------
const DEFAULT_PERMISSIONS: Record<EventPermissionKey, EventStaffRole[]> = {
  CREATE_TOURNAMENT:  ['TOURNAMENT_DIRECTOR'],
  MANAGE_TOURNAMENT:  ['TOURNAMENT_DIRECTOR', 'CASHIER'],
  MANAGE_CASH_GAME:   ['CASH_DIRECTOR'],
  VIEW_COMANDAS:      ['CASHIER'],
  DAILY_CLOSE:        [],
  POS_TOURNAMENT:     ['SANGEUR'],
  POS_CASH:           ['SANGEUR'],
  CAIXINHA:           ['TOURNAMENT_DIRECTOR', 'CASH_DIRECTOR', 'CASHIER', 'SANGEUR', 'DEALER'],
  PONTO:              ['TOURNAMENT_DIRECTOR', 'CASH_DIRECTOR', 'CASHIER', 'SANGEUR', 'DEALER'],
}

// ---------------------------------------------------------------------------
// Core helper: resolves a single permission for a user in an event.
// Order: ADMIN → host creator → EventStaff role lookup → config/defaults.
// ---------------------------------------------------------------------------
export async function hasEventPermission(
  userId: string,
  eventId: string,
  permission: EventPermissionKey,
): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!user) return false
  if (user.role === 'ADMIN') return true

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { hostId: true } })
  if (!event) return false
  if (event.hostId === userId) return true

  const staff = await prisma.eventStaff.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { role: true },
  })
  if (!staff) return false
  if (staff.role === 'HOST') return true

  // Check for explicit config override
  const config = await prisma.eventPermissionConfig.findUnique({
    where: { eventId_role_permission: { eventId, role: staff.role, permission } },
    select: { allowed: true },
  })
  if (config !== null) return config.allowed

  // Fall back to default matrix
  return DEFAULT_PERMISSIONS[permission].includes(staff.role)
}

// ---------------------------------------------------------------------------
// Convenience: throw if permission denied
// ---------------------------------------------------------------------------
export async function assertEventPermission(
  userId: string,
  eventId: string,
  permission: EventPermissionKey,
): Promise<void> {
  const ok = await hasEventPermission(userId, eventId, permission)
  if (!ok) throw new Error('Acesso negado')
}

// ---------------------------------------------------------------------------
// Legacy helpers — kept for backward compatibility with existing routes.
// Internally delegate to hasEventPermission where possible.
// ---------------------------------------------------------------------------

/** Host completo: criador do evento, EventStaff HOST, ou ADMIN. */
export async function isEventHost(userId: string, eventId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!user) return false
  if (user.role === 'ADMIN') return true

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { hostId: true } })
  if (!event) return false
  if (event.hostId === userId) return true

  const staff = await prisma.eventStaff.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { role: true },
  })
  return staff?.role === 'HOST'
}

/** Qualquer membro do staff (qualquer role). */
export async function isEventStaff(userId: string, eventId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!user) return false
  if (user.role === 'ADMIN') return true

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { hostId: true } })
  if (!event) return false
  if (event.hostId === userId) return true

  const staff = await prisma.eventStaff.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { role: true },
  })
  return !!staff
}

/** Acesso a Comandas: HOST ou CASHIER. */
export async function isEventCashier(userId: string, eventId: string): Promise<boolean> {
  return hasEventPermission(userId, eventId, 'VIEW_COMANDAS')
}

// ---------------------------------------------------------------------------
// assert wrappers (legacy)
// ---------------------------------------------------------------------------
export async function assertEventHost(userId: string, eventId: string): Promise<void> {
  const ok = await isEventHost(userId, eventId)
  if (!ok) throw new Error('Acesso negado')
}

export async function assertEventStaff(userId: string, eventId: string): Promise<void> {
  const ok = await isEventStaff(userId, eventId)
  if (!ok) throw new Error('Acesso negado')
}

export async function assertEventCashier(userId: string, eventId: string): Promise<void> {
  const ok = await isEventCashier(userId, eventId)
  if (!ok) throw new Error('Acesso negado')
}

// ---------------------------------------------------------------------------
// Permission matrix helpers — retornam a matriz completa para um evento,
// mesclando defaults com overrides salvos no banco.
// Usado pela página de configuração de permissões.
// ---------------------------------------------------------------------------

export interface PermissionMatrixRow {
  role: EventStaffRole
  permission: EventPermissionKey
  allowed: boolean
  isOverride: boolean
}

const ALL_ROLES: EventStaffRole[] = [
  'TOURNAMENT_DIRECTOR', 'CASH_DIRECTOR', 'CASHIER', 'SANGEUR', 'DEALER',
]
const ALL_PERMISSIONS = Object.keys(DEFAULT_PERMISSIONS) as EventPermissionKey[]

export async function getEventPermissionMatrix(eventId: string): Promise<PermissionMatrixRow[]> {
  const overrides = await prisma.eventPermissionConfig.findMany({
    where: { eventId },
    select: { role: true, permission: true, allowed: true },
  })

  const overrideMap = new Map(
    overrides.map((o) => [`${o.role}:${o.permission}`, o.allowed]),
  )

  const rows: PermissionMatrixRow[] = []
  for (const role of ALL_ROLES) {
    for (const permission of ALL_PERMISSIONS) {
      const key = `${role}:${permission}`
      const isOverride = overrideMap.has(key)
      const allowed = isOverride
        ? overrideMap.get(key)!
        : DEFAULT_PERMISSIONS[permission].includes(role)
      rows.push({ role, permission, allowed, isOverride })
    }
  }
  return rows
}

export async function setEventPermission(
  eventId: string,
  role: EventStaffRole,
  permission: EventPermissionKey,
  allowed: boolean,
): Promise<void> {
  const defaultAllowed = DEFAULT_PERMISSIONS[permission].includes(role)

  if (allowed === defaultAllowed) {
    // Remove override — let default apply
    await prisma.eventPermissionConfig.deleteMany({
      where: { eventId, role, permission },
    })
  } else {
    await prisma.eventPermissionConfig.upsert({
      where: { eventId_role_permission: { eventId, role, permission } },
      create: { eventId, role, permission, allowed },
      update: { allowed },
    })
  }
}
