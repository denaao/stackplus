import { prisma } from '../../lib/prisma'
import { notifySessionFinishedIfEnabled } from '../whatsapp/evolution.service'
import { generateSessionFinancialReport } from '../banking/annapay.service'

function withCaixinhaDistribution<T extends {
  caixinha: unknown
  staffAssignments?: Array<{ userId: string; user?: { id: string; name: string; pixType?: string | null; pixKey?: string | null } }>
}>(session: T) {
  const staffAssignments = Array.isArray(session.staffAssignments) ? session.staffAssignments : []
  const totalCaixinha = Number(session.caixinha || 0)

  if (totalCaixinha <= 0 || staffAssignments.length === 0) {
    return {
      ...session,
      caixinhaPerStaff: 0,
      caixinhaDistribution: [] as Array<{ userId: string; name: string; amount: number; pixType?: string | null; pixKey?: string | null }>,
    }
  }

  const totalCents = Math.round(totalCaixinha * 100)
  const perStaffCents = Math.floor(totalCents / staffAssignments.length)
  const perStaffAmount = Number((perStaffCents / 100).toFixed(2))

  return {
    ...session,
    caixinhaPerStaff: perStaffAmount,
    caixinhaDistribution: staffAssignments.map((assignment) => ({
      userId: assignment.userId,
      name: assignment.user?.name || 'Staff',
      amount: perStaffAmount,
      pixType: assignment.user?.pixType || null,
      pixKey: assignment.user?.pixKey || null,
    })),
  }
}

const sessionInclude = {
  homeGame: true,
  cashier: { select: { id: true, name: true } },
  playerStates: {
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { result: 'desc' as const },
  },
  staffAssignments: {
    include: { user: { select: { id: true, name: true, email: true, pixType: true, pixKey: true } } },
    orderBy: { user: { name: 'asc' as const } },
  },
  participantAssignments: {
    include: { user: { select: { id: true, name: true, email: true, pixType: true, pixKey: true } } },
    orderBy: { user: { name: 'asc' as const } },
  },
} satisfies Parameters<typeof prisma.session.findUniqueOrThrow>[0]['include']

type GameType = 'CASH_GAME' | 'TOURNAMENT'

type CreateSessionInput = {
  pokerVariant?: 'HOLDEN' | 'BUTTON_CHOICE' | 'PINEAPPLE' | 'OMAHA' | 'OMAHA_FIVE' | 'OMAHA_SIX'
  gameType?: GameType
  chipValue?: number
  smallBlind?: number
  bigBlind?: number
  minimumBuyIn?: number
  minimumStayMinutes?: number
  foodFee?: number
  buyInAmount?: number
  rebuyAmount?: number
  addOnAmount?: number
  blindsMinutesBeforeBreak?: number
  blindsMinutesAfterBreak?: number
  levelsUntilBreak?: number
}

export async function createSession(homeGameId: string, hostId: string, input: CreateSessionInput = {}) {
  const game = await prisma.homeGame.findUniqueOrThrow({ where: { id: homeGameId } })
  if (game.hostId !== hostId) throw new Error('Apenas o host pode criar sessões')

  const finalGameType = input.gameType || game.gameType

  return prisma.session.create({
    data: {
      homeGameId,
      status: 'WAITING',
      pokerVariant: input.pokerVariant ?? null,
      gameType: finalGameType,
      chipValue: finalGameType === 'CASH_GAME'
        ? (input.chipValue ?? Number(game.chipValue))
        : null,
      smallBlind: finalGameType === 'CASH_GAME'
        ? (input.smallBlind ?? null)
        : null,
      bigBlind: finalGameType === 'CASH_GAME'
        ? (input.bigBlind ?? null)
        : null,
      minimumBuyIn: finalGameType === 'CASH_GAME'
        ? (input.minimumBuyIn ?? null)
        : null,
      minimumStayMinutes: finalGameType === 'CASH_GAME'
        ? (input.minimumStayMinutes ?? null)
        : null,
      foodFee: finalGameType === 'CASH_GAME'
        ? (input.foodFee ?? null)
        : null,
      buyInAmount: finalGameType === 'TOURNAMENT'
        ? (input.buyInAmount ?? (game.buyInAmount == null ? null : Number(game.buyInAmount)))
        : null,
      rebuyAmount: finalGameType === 'TOURNAMENT'
        ? (input.rebuyAmount ?? (game.rebuyAmount == null ? null : Number(game.rebuyAmount)))
        : null,
      addOnAmount: finalGameType === 'TOURNAMENT'
        ? (input.addOnAmount ?? (game.addOnAmount == null ? null : Number(game.addOnAmount)))
        : null,
      blindsMinutesBeforeBreak: finalGameType === 'TOURNAMENT'
        ? (input.blindsMinutesBeforeBreak ?? game.blindsMinutesBeforeBreak)
        : null,
      blindsMinutesAfterBreak: finalGameType === 'TOURNAMENT'
        ? (input.blindsMinutesAfterBreak ?? game.blindsMinutesAfterBreak)
        : null,
      levelsUntilBreak: finalGameType === 'TOURNAMENT'
        ? (input.levelsUntilBreak ?? game.levelsUntilBreak)
        : null,
    },
    include: { homeGame: true },
  })
}

export async function startSession(sessionId: string, hostId: string, cashierId?: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      homeGame: true,
      participantAssignments: { select: { userId: true } },
    },
  })
  if (session.homeGame.hostId !== hostId) throw new Error('Acesso negado')
  if (session.status !== 'WAITING') throw new Error('Sessão já iniciada')
  if (session.gameType === 'CASH_GAME' && session.participantAssignments.length < 2) {
    throw new Error('Selecione pelo menos 2 participantes para iniciar a partida')
  }

  const updatedSession = await prisma.session.update({
    where: { id: sessionId },
    data: { status: 'ACTIVE', startedAt: new Date(), cashierId: cashierId || null },
    include: sessionInclude,
  })

  return withCaixinhaDistribution(updatedSession)
}

export async function finishSession(sessionId: string, hostId: string, options?: { rake?: number; caixinha?: number }) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      homeGame: true,
      staffAssignments: { select: { userId: true } },
    },
  })
  if (session.homeGame.hostId !== hostId) throw new Error('Acesso negado')
  if (session.status !== 'ACTIVE') throw new Error('Sessão não está ativa')

  const caixinha = Number(options?.caixinha || 0)
  if (caixinha > 0) {
    if (session.staffAssignments.length === 0) {
      throw new Error('Selecione ao menos 1 membro no staff para distribuir a caixinha')
    }

    const caixinhaCents = Math.round(caixinha * 100)
    if (caixinhaCents % session.staffAssignments.length !== 0) {
      throw new Error('A caixinha deve ser divisivel igualmente entre todos do staff')
    }
  }

  const updatedSession = await prisma.session.update({
    where: { id: sessionId },
    data: {
      status: 'FINISHED',
      finishedAt: new Date(),
      rake: options?.rake ? Number(options.rake) : null,
      caixinha: options?.caixinha ? Number(options.caixinha) : null,
    },
    include: sessionInclude,
  })

  void notifySessionFinishedIfEnabled(updatedSession.id).catch((error) => {
    console.error('[WHATSAPP] Falha ao notificar encerramento da sessão:', error)
  })

  const payload = withCaixinhaDistribution(updatedSession)
  if (process.env.ANNAPAY_AUTO_FINANCIAL_REPORT !== 'true') {
    return payload
  }

  try {
    const financialReport = await generateSessionFinancialReport(updatedSession.id, hostId)
    return {
      ...payload,
      financialReport,
    }
  } catch (error) {
    console.error('[ANNAPAY] Falha ao gerar relatório financeiro automático:', error)
    return {
      ...payload,
      financialReportError: 'Falha ao gerar relatório financeiro automático',
    }
  }
}

export async function getSessionById(sessionId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: sessionInclude,
  })

  return withCaixinhaDistribution(session)
}

export async function getSessionStaffOptions(sessionId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      homeGame: {
        include: {
          host: { select: { id: true, name: true, email: true, pixType: true, pixKey: true } },
          members: { include: { user: { select: { id: true, name: true, email: true, pixType: true, pixKey: true } } } },
        },
      },
    },
  })

  const map = new Map<string, { id: string; name: string; email: string | null; pixType: string | null; pixKey: string | null }>()
  map.set(session.homeGame.host.id, session.homeGame.host)
  for (const member of session.homeGame.members) {
    map.set(member.user.id, member.user)
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export async function getSessionParticipantOptions(sessionId: string) {
  return getSessionStaffOptions(sessionId)
}

export async function updateSessionStaff(sessionId: string, hostId: string, userIds: string[]) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      homeGame: {
        include: {
          host: { select: { id: true } },
          members: { select: { userId: true } },
        },
      },
    },
  })

  if (session.homeGame.hostId !== hostId) throw new Error('Acesso negado')

  const allowedIds = new Set<string>([
    session.homeGame.host.id,
    ...session.homeGame.members.map((member) => member.userId),
  ])

  for (const userId of userIds) {
    if (!allowedIds.has(userId)) {
      throw new Error('Staff deve pertencer ao Home Game')
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.sessionStaff.deleteMany({ where: { sessionId } })

    if (userIds.length > 0) {
      await tx.sessionStaff.createMany({
        data: userIds.map((userId) => ({ sessionId, userId })),
      })
    }
  })

  return getSessionById(sessionId)
}

export async function updateSessionParticipants(sessionId: string, hostId: string, userIds: string[]) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      homeGame: {
        include: {
          host: { select: { id: true } },
          members: { select: { userId: true } },
        },
      },
    },
  })

  if (session.homeGame.hostId !== hostId) throw new Error('Acesso negado')
  if (session.status === 'FINISHED') throw new Error('Sessão já finalizada')

  const allowedIds = new Set<string>([
    session.homeGame.host.id,
    ...session.homeGame.members.map((member) => member.userId),
  ])

  for (const userId of userIds) {
    if (!allowedIds.has(userId)) {
      throw new Error('Participantes devem pertencer ao Home Game')
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.sessionParticipant.deleteMany({ where: { sessionId } })

    if (userIds.length > 0) {
      await tx.sessionParticipant.createMany({
        data: userIds.map((userId) => ({ sessionId, userId })),
      })
    }
  })

  return getSessionById(sessionId)
}

export async function getSessionsByHomeGame(homeGameId: string) {
  return prisma.session.findMany({
    where: { homeGameId },
    include: { _count: { select: { playerStates: true, transactions: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function deleteSession(sessionId: string, hostId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: { homeGame: true },
  })

  if (session.homeGame.hostId !== hostId) throw new Error('Acesso negado')

  await prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { sessionId } })
    await tx.playerSessionState.deleteMany({ where: { sessionId } })
    await tx.sessionStaff.deleteMany({ where: { sessionId } })
    await tx.sessionParticipant.deleteMany({ where: { sessionId } })
    await tx.session.delete({ where: { id: sessionId } })
  })
}
