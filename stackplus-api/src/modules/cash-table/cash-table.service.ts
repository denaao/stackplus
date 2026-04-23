import { prisma } from '../../lib/prisma'

const tableInclude = {
  seats: {
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { seatedAt: 'asc' as const },
  },
  sangrias: { orderBy: { createdAt: 'asc' as const } },
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getSessionTables(sessionId: string) {
  return prisma.cashTable.findMany({
    where: { sessionId },
    include: tableInclude,
    orderBy: { openedAt: 'asc' },
  })
}

export async function getTable(tableId: string) {
  return prisma.cashTable.findUniqueOrThrow({
    where: { id: tableId },
    include: tableInclude,
  })
}

// ─── Mesa ─────────────────────────────────────────────────────────────────────

export async function createTable(
  sessionId: string,
  name: string,
  caixinhaMode: string,
) {
  const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } })
  if (session.status === 'FINISHED') throw new Error('Sessão já encerrada')

  return prisma.cashTable.create({
    data: { sessionId, name, caixinhaMode },
    include: tableInclude,
  })
}

export async function updateTableRake(
  tableId: string,
  rake: number,
  caixinha?: number,
) {
  const table = await prisma.cashTable.findUniqueOrThrow({ where: { id: tableId } })
  if (table.status === 'CLOSED') throw new Error('Mesa já está fechada')

  return prisma.cashTable.update({
    where: { id: tableId },
    data: {
      rake,
      ...(caixinha !== undefined ? { caixinha } : {}),
    },
    include: tableInclude,
  })
}

// ─── Seats ────────────────────────────────────────────────────────────────────

export async function addSeat(tableId: string, userId: string) {
  const table = await prisma.cashTable.findUniqueOrThrow({ where: { id: tableId } })
  if (table.status === 'CLOSED') throw new Error('Mesa já está fechada')

  // Upsert: se jogador já teve seat nessa mesa (ex: voltou após cashout), reabre.
  return prisma.cashTableSeat.upsert({
    where: { tableId_userId: { tableId, userId } },
    create: { tableId, userId, currentStack: 0 },
    update: { hasCashedOut: false, cashedOutAt: null, seatedAt: new Date() },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  })
}

export async function updateSeatStack(
  tableId: string,
  userId: string,
  currentStack: number,
  hasCashedOut?: boolean,
) {
  return prisma.cashTableSeat.update({
    where: { tableId_userId: { tableId, userId } },
    data: {
      currentStack,
      ...(hasCashedOut !== undefined ? { hasCashedOut, cashedOutAt: hasCashedOut ? new Date() : null } : {}),
    },
  })
}

// ─── Sangria ──────────────────────────────────────────────────────────────────

export async function createSangria(
  tableId: string,
  rake: number,
  caixinha: number,
  isFinal: boolean,
  note: string | undefined,
  createdByUserId: string,
) {
  const table = await prisma.cashTable.findUniqueOrThrow({
    where: { id: tableId },
    include: { seats: true },
  })

  if (table.status === 'CLOSED') throw new Error('Mesa já está fechada')

  if (isFinal) {
    const hasActivePlayers = table.seats.some((s) => !s.hasCashedOut)
    if (hasActivePlayers) {
      throw new Error('Todos os jogadores devem fazer cashout antes da sangria final')
    }
  }

  return prisma.$transaction(async (tx) => {
    const sangria = await tx.cashTableSangria.create({
      data: { tableId, rake, caixinha, isFinal, note, createdByUserId },
    })

    if (isFinal) {
      await tx.cashTable.update({
        where: { id: tableId },
        data: { status: 'CLOSED', closedAt: new Date() },
      })
    }

    return sangria
  })
}

export async function getSangrias(tableId: string) {
  return prisma.cashTableSangria.findMany({
    where: { tableId },
    orderBy: { createdAt: 'asc' },
  })
}
