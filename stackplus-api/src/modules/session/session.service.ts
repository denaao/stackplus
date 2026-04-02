import { prisma } from '../../lib/prisma'
import { notifySessionFinishedIfEnabled } from '../whatsapp/evolution.service'
import { generateSessionFinancialReport } from '../banking/annapay.service'
import { FinancialModule } from '@prisma/client'

function amountToFixed(value: number) {
  return Number(value.toFixed(2))
}

function buildRakebackDistribution(params: {
  totalRake: number
  rakebackAssignments: Array<{ userId: string; percent?: unknown; user?: { name?: string | null; pixType?: string | null; pixKey?: string | null } }>
}) {
  const totalRake = Number(params.totalRake || 0)
  const rakebackAssignments = Array.isArray(params.rakebackAssignments) ? params.rakebackAssignments : []

  const rakebackPercents = rakebackAssignments.map((assignment) => {
    const percent = Number(assignment.percent || 0)
    return Number.isFinite(percent) && percent > 0 ? percent : 0
  })

  if (totalRake <= 0 || rakebackAssignments.length === 0 || rakebackPercents.every((percent) => percent <= 0)) {
    return {
      totalRakeback: 0,
      byUserId: {} as Record<string, number>,
      items: [] as Array<{ userId: string; name: string; percent: number; amount: number; pixType?: string | null; pixKey?: string | null }>,
    }
  }

  const totalRakeCents = Math.round(totalRake * 100)
  const distributionParts = rakebackAssignments.map((assignment, index) => {
    const percent = rakebackPercents[index]
    const rawCents = totalRakeCents * (percent / 100)
    const cents = Math.floor(rawCents)
    return {
      userId: assignment.userId,
      percent,
      cents,
      remainder: rawCents - cents,
      name: assignment.user?.name || 'Staff',
      pixType: assignment.user?.pixType || null,
      pixKey: assignment.user?.pixKey || null,
    }
  })

  const targetTotalRakebackCents = Math.round(totalRakeCents * (rakebackPercents.reduce((sum, percent) => sum + percent, 0) / 100))
  const baseCents = distributionParts.reduce((sum, item) => sum + item.cents, 0)
  let remainingCents = targetTotalRakebackCents - baseCents

  if (remainingCents > 0) {
    const sortedByRemainder = [...distributionParts].sort((a, b) => b.remainder - a.remainder)
    let cursor = 0
    while (remainingCents > 0 && sortedByRemainder.length > 0) {
      sortedByRemainder[cursor % sortedByRemainder.length].cents += 1
      remainingCents -= 1
      cursor += 1
    }
  }

  const byUserId = distributionParts.reduce<Record<string, number>>((acc, item) => {
    acc[item.userId] = amountToFixed(item.cents / 100)
    return acc
  }, {})

  const items = distributionParts
    .filter((item) => item.percent > 0)
    .map((item) => ({
      userId: item.userId,
      name: item.name,
      percent: amountToFixed(item.percent),
      amount: amountToFixed(item.cents / 100),
      pixType: item.pixType,
      pixKey: item.pixKey,
    }))

  return {
    totalRakeback: amountToFixed(items.reduce((sum, item) => sum + item.amount, 0)),
    byUserId,
    items,
  }
}

function withCaixinhaDistribution<T extends {
  caixinha: unknown
  rake?: unknown
  staffAssignments?: Array<{ userId: string; user?: { id: string; name: string; pixType?: string | null; pixKey?: string | null } }>
  rakebackAssignments?: Array<{ userId: string; percent?: unknown; user?: { id: string; name: string; pixType?: string | null; pixKey?: string | null } }>
}>(session: T) {
  const staffAssignments = Array.isArray(session.staffAssignments) ? session.staffAssignments : []
  const rakebackAssignments = Array.isArray(session.rakebackAssignments) ? session.rakebackAssignments : []
  const totalCaixinha = Number(session.caixinha || 0)
  const rakebackDistribution = buildRakebackDistribution({
    totalRake: Number(session.rake || 0),
    rakebackAssignments,
  })

  if (totalCaixinha <= 0 || staffAssignments.length === 0) {
    return {
      ...session,
      caixinhaPerStaff: 0,
      caixinhaDistribution: [] as Array<{ userId: string; name: string; amount: number; pixType?: string | null; pixKey?: string | null }>,
      totalRakeback: rakebackDistribution.totalRakeback,
      rakebackDistribution: rakebackDistribution.items,
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
    totalRakeback: rakebackDistribution.totalRakeback,
    rakebackDistribution: rakebackDistribution.items,
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
  rakebackAssignments: {
    include: { user: { select: { id: true, name: true, email: true, pixType: true, pixKey: true } } },
    orderBy: { user: { name: 'asc' as const } },
  },
  participantAssignments: {
    include: { user: { select: { id: true, name: true, email: true, pixType: true, pixKey: true } } },
    orderBy: { user: { name: 'asc' as const } },
  },
} satisfies Parameters<typeof prisma.session.findUniqueOrThrow>[0]['include']

const publicSessionInclude = {
  homeGame: { select: { id: true, name: true } },
  playerStates: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { result: 'desc' as const },
  },
} satisfies Parameters<typeof prisma.session.findUniqueOrThrow>[0]['include']

type GameType = 'CASH_GAME' | 'TOURNAMENT'

type CreateSessionInput = {
  pokerVariant?: 'HOLDEN' | 'BUTTON_CHOICE' | 'PINEAPPLE' | 'OMAHA' | 'OMAHA_FIVE' | 'OMAHA_SIX'
  gameType?: GameType
  financialModule?: FinancialModule
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

async function getSessionAccessContext(sessionId: string) {
  return prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      cashierId: true,
      homeGame: {
        select: {
          hostId: true,
        },
      },
    },
  })
}

function canAccessPrivateSession(session: Awaited<ReturnType<typeof getSessionAccessContext>>, userId: string) {
  return session.homeGame.hostId === userId || session.cashierId === userId
}

export async function createSession(homeGameId: string, hostId: string, input: CreateSessionInput = {}) {
  const game = await prisma.homeGame.findUniqueOrThrow({ where: { id: homeGameId } })
  if (game.hostId !== hostId) throw new Error('Apenas o host pode criar sessões')

  const finalGameType = input.gameType || game.gameType
  const finalFinancialModule = input.financialModule || game.financialModule || FinancialModule.POSTPAID

  return prisma.session.create({
    data: {
      homeGameId,
      status: 'WAITING',
      pokerVariant: input.pokerVariant ?? null,
      gameType: finalGameType,
      financialModule: finalFinancialModule,
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
      staffAssignments: {
        select: {
          userId: true,
        },
      },
      rakebackAssignments: {
        select: {
          userId: true,
          percent: true,
        },
      },
      playerStates: {
        select: {
          id: true,
          userId: true,
          result: true,
        },
      },
    },
  })
  if (session.homeGame.hostId !== hostId) throw new Error('Acesso negado')
  if (session.status !== 'ACTIVE') throw new Error('Sessão não está ativa')

  const caixinha = Number(options?.caixinha || 0)
  const rake = Number(options?.rake || 0)

  const rakebackPercentTotal = session.rakebackAssignments.reduce((sum, assignment) => {
    return sum + Number(assignment.percent || 0)
  }, 0)

  if (rakebackPercentTotal > 100) {
    throw new Error('A soma do rakeback do staff não pode passar de 100%')
  }

  if (caixinha > 0) {
    if (session.staffAssignments.length === 0) {
      throw new Error('Selecione ao menos 1 membro no staff para distribuir a caixinha')
    }

    const caixinhaCents = Math.round(caixinha * 100)
    if (caixinhaCents % session.staffAssignments.length !== 0) {
      throw new Error('A caixinha deve ser divisivel igualmente entre todos do staff')
    }
  }

  const rakebackByUserId = buildRakebackDistribution({
    totalRake: rake,
    rakebackAssignments: session.rakebackAssignments,
  }).byUserId

  const updatedSession = await prisma.$transaction(async (tx) => {
    if (Object.keys(rakebackByUserId).length > 0) {
      for (const state of session.playerStates) {
        const rakebackAmount = Number(rakebackByUserId[state.userId] || 0)
        if (rakebackAmount <= 0) continue

        await tx.playerSessionState.update({
          where: { id: state.id },
          data: {
            result: amountToFixed(Number(state.result) + rakebackAmount),
          },
        })
      }
    }

    return tx.session.update({
      where: { id: sessionId },
      data: {
        status: 'FINISHED',
        finishedAt: new Date(),
        rake: options?.rake ? Number(options.rake) : null,
        caixinha: options?.caixinha ? Number(options.caixinha) : null,
      },
      include: sessionInclude,
    })
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

export async function getSessionByIdForOperator(sessionId: string, userId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: sessionInclude,
  })

  if (!canAccessPrivateSession({
    id: session.id,
    status: session.status,
    cashierId: session.cashierId,
    homeGame: { hostId: session.homeGame.hostId },
  }, userId)) {
    throw new Error('Acesso negado')
  }

  return withCaixinhaDistribution(session)
}

export async function getPublicSessionById(sessionId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: publicSessionInclude,
  })

  if (session.status === 'WAITING') {
    throw new Error('Acesso negado')
  }

  return session
}

export async function canJoinPrivateSession(sessionId: string, userId: string) {
  const session = await getSessionAccessContext(sessionId)
  return canAccessPrivateSession(session, userId)
}

export async function canJoinPublicSession(sessionId: string) {
  const session = await getSessionAccessContext(sessionId)
  return session.status !== 'WAITING'
}

export async function getSessionStaffOptions(sessionId: string, hostId: string) {
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

  if (session.homeGame.hostId !== hostId) {
    throw new Error('Acesso negado')
  }

  const map = new Map<string, { id: string; name: string; email: string | null; pixType: string | null; pixKey: string | null }>()
  map.set(session.homeGame.host.id, session.homeGame.host)
  for (const member of session.homeGame.members) {
    map.set(member.user.id, member.user)
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export async function getSessionParticipantOptions(sessionId: string, hostId: string) {
  return getSessionStaffOptions(sessionId, hostId)
}

export async function updateSessionStaff(
  sessionId: string,
  hostId: string,
  userIds: string[],
) {
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

export async function updateSessionRakeback(
  sessionId: string,
  hostId: string,
  assignments: Array<{ userId: string; percent: number }>,
) {
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

  for (const assignment of assignments) {
    if (!allowedIds.has(assignment.userId)) {
      throw new Error('Rakeback deve pertencer ao Home Game')
    }

    const percent = Number(assignment.percent || 0)
    if (percent < 0 || percent > 100) {
      throw new Error('Rakeback por jogador deve estar entre 0% e 100%')
    }
  }

  const totalPercent = assignments.reduce((sum, assignment) => sum + Number(assignment.percent || 0), 0)
  if (totalPercent > 100) {
    throw new Error('A soma do rakeback não pode passar de 100%')
  }

  await prisma.$transaction(async (tx) => {
    await tx.sessionRakeback.deleteMany({ where: { sessionId } })

    if (assignments.length > 0) {
      await tx.sessionRakeback.createMany({
        data: assignments.map((assignment) => ({
          sessionId,
          userId: assignment.userId,
          percent: Number(assignment.percent || 0),
        })),
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

export async function getSessionsByHomeGameForUser(homeGameId: string, userId: string) {
  const homeGame = await prisma.homeGame.findUniqueOrThrow({
    where: { id: homeGameId },
    select: {
      hostId: true,
      members: {
        where: { userId },
        select: { id: true },
      },
    },
  })

  if (homeGame.hostId !== userId && homeGame.members.length === 0) {
    throw new Error('Acesso negado')
  }

  return getSessionsByHomeGame(homeGameId)
}

export async function deleteSession(sessionId: string, hostId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: { homeGame: true },
  })

  if (session.homeGame.hostId !== hostId) throw new Error('Acesso negado')

  await prisma.$transaction(async (tx) => {
    await tx.prepaidChargePending.deleteMany({ where: { sessionId } })
    await tx.sessionFinancialChargePending.deleteMany({ where: { sessionId } })
    await tx.sessionFinancialPayoutPending.deleteMany({ where: { sessionId } })
    await tx.transaction.deleteMany({ where: { sessionId } })
    await tx.playerSessionState.deleteMany({ where: { sessionId } })
    await tx.sessionStaff.deleteMany({ where: { sessionId } })
    await tx.sessionRakeback.deleteMany({ where: { sessionId } })
    await tx.sessionParticipant.deleteMany({ where: { sessionId } })
    await tx.session.delete({ where: { id: sessionId } })
  })
}
