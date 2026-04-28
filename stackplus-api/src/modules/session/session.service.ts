import { prisma } from '../../lib/prisma'
import { generateSessionFinancialReport } from '../banking/annapay.service'
import { FinancialModule, ComandaItemType } from '@prisma/client'
import { isHomeGameHost } from '../../lib/homegame-auth'
import { isEventStaff } from '../../lib/event-auth'
import { findOrOpenComandaWithTx, addComandaItemWithTx } from '../comanda/comanda.service'
import { logger } from '../../lib/logger'

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
  staffAssignments?: Array<{ userId: string; caixinhaAmount?: unknown; user?: { id: string; name: string; pixType?: string | null; pixKey?: string | null } }>
  rakebackAssignments?: Array<{ userId: string; percent?: unknown; user?: { id: string; name: string; pixType?: string | null; pixKey?: string | null } }>
}>(session: T) {
  const rakebackAssignments = Array.isArray(session.rakebackAssignments) ? session.rakebackAssignments : []
  // caixinha e rake foram movidos para CashTable — retorna distribuição vazia
  const rakebackDistribution = buildRakebackDistribution({
    totalRake: 0,
    rakebackAssignments,
  })

  return {
    ...session,
    caixinhaMode: 'SPLIT',
    caixinhaPerStaff: 0,
    caixinhaDistribution: [] as Array<{ userId: string; name: string; amount: number; pixType?: string | null; pixKey?: string | null }>,
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
  name?: string
  pokerVariant?: 'HOLDEN' | 'BUTTON_CHOICE' | 'PINEAPPLE' | 'OMAHA' | 'OMAHA_FIVE' | 'OMAHA_SIX'
  gameType?: GameType
  financialModule?: FinancialModule
  jackpotEnabled?: boolean
  jackpotAccumulated?: number
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
      homeGameId: true,
      homeGame: {
        select: {
          hostId: true,
        },
      },
    },
  })
}

async function canAccessPrivateSession(
  session: { cashierId: string | null; homeGameId: string },
  userId: string,
) {
  if (session.cashierId === userId) return true
  return isHomeGameHost(userId, session.homeGameId)
}

export async function createSession(homeGameId: string, hostId: string, input: CreateSessionInput = {}) {
  if (!(await isHomeGameHost(hostId, homeGameId))) {
    throw new Error('Apenas o host pode criar sessões')
  }
  const game = await prisma.homeGame.findUniqueOrThrow({ where: { id: homeGameId } })

  const finalGameType = input.gameType || game.gameType
  const finalFinancialModule = input.financialModule || game.financialModule || FinancialModule.POSTPAID

  return prisma.session.create({
    data: {
      homeGameId,
      name: input.name ?? null,
      status: 'WAITING',
      pokerVariant: input.pokerVariant ?? null,
      gameType: finalGameType,
      financialModule: finalFinancialModule,
        jackpotEnabled: input.jackpotEnabled ?? false,
        jackpotAccumulated: input.jackpotEnabled
          ? (input.jackpotAccumulated ?? Number(game.jackpotAccumulated))
          : null,
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
  if (!(await isHomeGameHost(hostId, session.homeGameId))) throw new Error('Acesso negado')
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

export async function finishSession(
  sessionId: string,
  hostId: string,
  options?: {
    rake?: number
    caixinha?: number
    caixinhaByStaff?: Array<{ userId: string; amount: number }>
    jackpotArrecadado?: number
  },
) {
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
      transactions: {
        select: {
          type: true,
          amount: true,
        },
      },
    },
  })
  if (!(await isHomeGameHost(hostId, session.homeGameId))) throw new Error('Acesso negado')
  if (session.status !== 'ACTIVE') throw new Error('Sessão não está ativa')

  const caixinhaMode = (session as unknown as { caixinhaMode?: string }).caixinhaMode === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'SPLIT'
  const rake = Number(options?.rake || 0)
  const jackpotArrecadado = Number(options?.jackpotArrecadado || 0)
  const jackpotDistribuido = session.transactions
    .filter((transaction) => transaction.type === 'JACKPOT')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0)
  const jackpotAtual = Number((session as unknown as { jackpotAccumulated?: string | number }).jackpotAccumulated ?? session.homeGame.jackpotAccumulated ?? 0)
  const jackpotNovo = amountToFixed(Math.max(0, jackpotAtual + jackpotArrecadado - jackpotDistribuido))

  const rakebackPercentTotal = session.rakebackAssignments.reduce((sum, assignment) => {
    return sum + Number(assignment.percent || 0)
  }, 0)

  if (rakebackPercentTotal > 100) {
    throw new Error('A soma do rakeback do staff não pode passar de 100%')
  }

  let caixinha = 0
  const caixinhaByStaffMap = new Map<string, number>()

  if (caixinhaMode === 'INDIVIDUAL') {
    const list = Array.isArray(options?.caixinhaByStaff) ? options!.caixinhaByStaff : []
    const staffUserIds = new Set(session.staffAssignments.map((s) => s.userId))
    for (const entry of list) {
      const amount = Number(entry.amount || 0)
      if (amount < 0) throw new Error('Caixinha individual não pode ser negativa')
      if (!staffUserIds.has(entry.userId)) {
        throw new Error('Caixinha informada para usuário fora do staff')
      }
      caixinhaByStaffMap.set(entry.userId, amount)
    }
    caixinha = Array.from(caixinhaByStaffMap.values()).reduce((sum, v) => sum + v, 0)
    if (caixinha > 0 && session.staffAssignments.length === 0) {
      throw new Error('Selecione ao menos 1 membro no staff para distribuir a caixinha')
    }
  } else {
    caixinha = Number(options?.caixinha || 0)
    if (caixinha > 0) {
      if (session.staffAssignments.length === 0) {
        throw new Error('Selecione ao menos 1 membro no staff para distribuir a caixinha')
      }
      const caixinhaCents = Math.round(caixinha * 100)
      if (caixinhaCents % session.staffAssignments.length !== 0) {
        throw new Error('A caixinha deve ser divisivel igualmente entre todos do staff')
      }
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

    await tx.homeGame.update({
      where: { id: session.homeGameId },
      data: { jackpotAccumulated: jackpotNovo },
    })

    if (caixinhaMode === 'INDIVIDUAL') {
      for (const assignment of session.staffAssignments) {
        const amount = caixinhaByStaffMap.get(assignment.userId) ?? 0
        await tx.sessionStaff.updateMany({
          where: { sessionId, userId: assignment.userId },
          data: { caixinhaAmount: amount },
        })
      }
    } else {
      await tx.sessionStaff.updateMany({
        where: { sessionId },
        data: { caixinhaAmount: null },
      })
    }

    // ─── Crédito de caixinha e rakeback nas comandas dos staff ────────────────
    // Caixinha: cada staff recebe sua parcela (split igual ou individual) como crédito.
    // Rakeback: cada beneficiário recebe seu % do rake como crédito.
    const staffCaixinhaPerUser = new Map<string, number>()
    if (session.staffAssignments.length > 0 && caixinha > 0) {
      if (caixinhaMode === 'INDIVIDUAL') {
        for (const s of session.staffAssignments) {
          const amount = caixinhaByStaffMap.get(s.userId) ?? 0
          if (amount > 0) staffCaixinhaPerUser.set(s.userId, amountToFixed(amount))
        }
      } else {
        const per = amountToFixed(caixinha / session.staffAssignments.length)
        for (const s of session.staffAssignments) {
          if (per > 0) staffCaixinhaPerUser.set(s.userId, per)
        }
      }
    }

    for (const [userId, amount] of staffCaixinhaPerUser) {
      const comanda = await findOrOpenComandaWithTx(tx, {
        playerId: userId,
        homeGameId: session.homeGameId,
        openedByUserId: hostId,
      })
      await addComandaItemWithTx(tx, {
        comandaId: comanda.id,
        type: ComandaItemType.STAFF_CAIXINHA,
        amount,
        description: `Caixinha — ${session.homeGame.name}`,
        sessionId,
        createdByUserId: hostId,
      })
    }

    for (const [userId, amount] of Object.entries(rakebackByUserId)) {
      const value = Number(amount)
      if (value <= 0) continue
      const comanda = await findOrOpenComandaWithTx(tx, {
        playerId: userId,
        homeGameId: session.homeGameId,
        openedByUserId: hostId,
      })
      await addComandaItemWithTx(tx, {
        comandaId: comanda.id,
        type: ComandaItemType.STAFF_RAKEBACK,
        amount: amountToFixed(value),
        description: `Rakeback — ${session.homeGame.name}`,
        sessionId,
        createdByUserId: hostId,
      })
    }

    return tx.session.update({
      where: { id: sessionId },
      data: {
        status: 'FINISHED',
        finishedAt: new Date(),
      },
      include: sessionInclude,
    })
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
    logger.error({ err: error }, '[ANNAPAY] falha ao gerar relatório financeiro automático')
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

  if (!(await canAccessPrivateSession({
    cashierId: session.cashierId,
    homeGameId: session.homeGameId,
  }, userId))) {
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
          members: {
            where: { role: { in: ['HOST', 'DEALER', 'SANGEUR'] } },
            include: { user: { select: { id: true, name: true, email: true, pixType: true, pixKey: true } } },
          },
        },
      },
    },
  })

  if (!(await isHomeGameHost(hostId, session.homeGameId))) {
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
  // Retorna TODOS os membros do HG (sem filtro de cargo) — qualquer membro pode participar
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      homeGame: {
        include: {
          host: { select: { id: true, name: true, email: true, pixType: true, pixKey: true } },
          members: {
            include: { user: { select: { id: true, name: true, email: true, pixType: true, pixKey: true } } },
          },
        },
      },
    },
  })

  if (!(await isHomeGameHost(hostId, session.homeGameId))) {
    throw new Error('Acesso negado')
  }

  const map = new Map<string, { id: string; name: string; email: string | null; pixType: string | null; pixKey: string | null }>()
  map.set(session.homeGame.host.id, session.homeGame.host)
  for (const member of session.homeGame.members) {
    map.set(member.user.id, member.user)
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export async function updateSessionStaff(
  sessionId: string,
  hostId: string,
  userIds: string[],
  caixinhaMode?: 'SPLIT' | 'INDIVIDUAL',
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

  if (!(await isHomeGameHost(hostId, session.homeGameId))) throw new Error('Acesso negado')

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

    // caixinhaMode was moved to CashTable — no longer stored on Session
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

  if (!(await isHomeGameHost(hostId, session.homeGameId))) throw new Error('Acesso negado')

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

  if (!(await isHomeGameHost(hostId, session.homeGameId))) throw new Error('Acesso negado')
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

  const isHost = await isHomeGameHost(userId, homeGameId)
  if (!isHost && homeGame.members.length === 0) {
    throw new Error('Acesso negado')
  }

  return getSessionsByHomeGame(homeGameId)
}

export async function deleteSession(sessionId: string, hostId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: { homeGame: true },
  })

  if (!(await isHomeGameHost(hostId, session.homeGameId))) throw new Error('Acesso negado')

  await prisma.$transaction(async (tx) => {
    await tx.prepaidChargePending.deleteMany({ where: { sessionId } })
    await tx.sessionFinancialChargePending.deleteMany({ where: { sessionId } })
    await tx.sessionFinancialPayoutPending.deleteMany({ where: { sessionId } })
    await tx.sangeurSale.deleteMany({ where: { shift: { sessionId } } })
    await tx.sangeurShiftMovement.deleteMany({ where: { shift: { sessionId } } })
    await tx.sangeurShift.deleteMany({ where: { sessionId } })
    await tx.transaction.deleteMany({ where: { sessionId } })
    await tx.playerSessionState.deleteMany({ where: { sessionId } })
    await tx.sessionStaff.deleteMany({ where: { sessionId } })
    await tx.sessionRakeback.deleteMany({ where: { sessionId } })
    await tx.sessionParticipant.deleteMany({ where: { sessionId } })
    await tx.session.delete({ where: { id: sessionId } })
  })
}

// ─── Event sessions ───────────────────────────────────────────────────────────

export async function createEventSession(eventId: string, requesterId: string, input: CreateSessionInput = {}) {
  if (!(await isEventStaff(requesterId, eventId))) {
    throw new Error('Apenas staff do evento pode criar sessoes')
  }

  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { financialModule: true, chipValue: true },
  })

  const finalGameType = input.gameType || 'CASH_GAME'
  const finalFinancialModule = input.financialModule || event.financialModule || FinancialModule.POSTPAID

  return prisma.session.create({
    data: {
      eventId,
      name: input.name ?? null,
      status: 'WAITING',
      pokerVariant: input.pokerVariant ?? null,
      gameType: finalGameType,
      financialModule: finalFinancialModule,
      jackpotEnabled: input.jackpotEnabled ?? false,
      jackpotAccumulated: null,
      chipValue: finalGameType === 'CASH_GAME'
        ? (input.chipValue ?? Number(event.chipValue))
        : null,
      smallBlind: finalGameType === 'CASH_GAME' ? (input.smallBlind ?? null) : null,
      bigBlind: finalGameType === 'CASH_GAME' ? (input.bigBlind ?? null) : null,
      minimumBuyIn: finalGameType === 'CASH_GAME' ? (input.minimumBuyIn ?? null) : null,
      minimumStayMinutes: finalGameType === 'CASH_GAME' ? (input.minimumStayMinutes ?? null) : null,
      foodFee: finalGameType === 'CASH_GAME' ? (input.foodFee ?? null) : null,
      buyInAmount: finalGameType === 'TOURNAMENT' ? (input.buyInAmount ?? null) : null,
      rebuyAmount: finalGameType === 'TOURNAMENT' ? (input.rebuyAmount ?? null) : null,
      addOnAmount: finalGameType === 'TOURNAMENT' ? (input.addOnAmount ?? null) : null,
      blindsMinutesBeforeBreak: finalGameType === 'TOURNAMENT' ? (input.blindsMinutesBeforeBreak ?? null) : null,
      blindsMinutesAfterBreak: finalGameType === 'TOURNAMENT' ? (input.blindsMinutesAfterBreak ?? null) : null,
      levelsUntilBreak: finalGameType === 'TOURNAMENT' ? (input.levelsUntilBreak ?? null) : null,
    },
  })
}

export async function getSessionsByEvent(eventId: string) {
  return prisma.session.findMany({
    where: { eventId },
    include: { _count: { select: { playerStates: true, transactions: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getSessionsByEventForUser(eventId: string, userId: string) {
  // Evento publico: qualquer usuario autenticado pode listar sessoes.
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { isPublic: true },
  })
  if (!event.isPublic) {
    const ok = await isEventStaff(userId, eventId)
    if (!ok) {
      // Verifica se tem comanda no evento
      const hasComanda = await prisma.comanda.findFirst({
        where: { eventId, playerId: userId },
        select: { id: true },
      })
      if (!hasComanda) throw new Error('Acesso negado')
    }
  }
  return getSessionsByEvent(eventId)
}
