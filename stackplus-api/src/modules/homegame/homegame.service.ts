import { prisma } from '../../lib/prisma'
import { generateJoinCode } from '../../utils/codeGenerator'
import { FinancialModule, MemberPaymentMode } from '@prisma/client'

export async function createHomeGame(hostId: string, data: {
  name: string
  gameType: 'CASH_GAME' | 'TOURNAMENT'
  financialModule?: FinancialModule
  address: string
  dayOfWeek: string
  startTime: string
  chipValue: number
  rules?: string
  buyInAmount?: number
  rebuyAmount?: number
  addOnAmount?: number
  blindsMinutesBeforeBreak?: number
  blindsMinutesAfterBreak?: number
  levelsUntilBreak?: number
}) {
  let joinCode = generateJoinCode()
  let tries = 0
  while (tries < 10) {
    const exists = await prisma.homeGame.findUnique({ where: { joinCode } })
    if (!exists) break
    joinCode = generateJoinCode()
    tries++
  }

  return prisma.homeGame.create({
    data: {
      ...data,
      financialModule: data.financialModule || FinancialModule.POSTPAID,
      hostId,
      joinCode,
    },
  })
}

export async function getHostGames(hostId: string) {
  return prisma.homeGame.findMany({
    where: { hostId },
    include: { _count: { select: { members: true, sessions: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getHomeGameById(id: string) {
  return prisma.homeGame.findUniqueOrThrow({
    where: { id },
    include: {
      host: { select: { id: true, name: true, email: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      _count: { select: { sessions: true } },
    },
  })
}

export async function updateFinancialConfig(
  homeGameId: string,
  hostId: string,
  input: {
    financialModule: FinancialModule
    hybridMembers?: Array<{ userId: string; paymentMode: MemberPaymentMode }>
  }
) {
  const game = await prisma.homeGame.findUniqueOrThrow({
    where: { id: homeGameId },
    include: {
      members: {
        select: { userId: true },
      },
    },
  })

  if (game.hostId !== hostId) throw new Error('Acesso negado')

  const memberIds = new Set(game.members.map((member) => member.userId))
  for (const item of input.hybridMembers || []) {
    if (!memberIds.has(item.userId)) {
      throw new Error('Todos os jogadores do híbrido precisam ser membros do Home Game')
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.homeGame.update({
      where: { id: homeGameId },
      data: { financialModule: input.financialModule },
    })

    if (input.financialModule === FinancialModule.HYBRID) {
      const hybridMap = new Map((input.hybridMembers || []).map((item) => [item.userId, item.paymentMode]))
      await Promise.all(
        game.members.map((member) => tx.homeGameMember.update({
          where: { homeGameId_userId: { homeGameId, userId: member.userId } },
          data: {
            paymentMode: hybridMap.get(member.userId) || MemberPaymentMode.POSTPAID,
          },
        }))
      )
      return
    }

    const forcedMode = input.financialModule === FinancialModule.PREPAID
      ? MemberPaymentMode.PREPAID
      : MemberPaymentMode.POSTPAID

    await tx.homeGameMember.updateMany({
      where: { homeGameId },
      data: { paymentMode: forcedMode },
    })
  })

  return getHomeGameById(homeGameId)
}

export async function joinHomeGame(userId: string, joinCode: string) {
  const homeGame = await prisma.homeGame.findUnique({ where: { joinCode } })
  if (!homeGame) throw new Error('Código inválido')

  const existing = await prisma.homeGameMember.findUnique({
    where: { homeGameId_userId: { homeGameId: homeGame.id, userId } },
  })
  if (existing) throw new Error('Você já faz parte deste Home Game')

  await prisma.homeGameMember.create({
    data: { homeGameId: homeGame.id, userId },
  })

  return homeGame
}

export async function getPlayerGames(userId: string) {
  return prisma.homeGameMember.findMany({
    where: { userId },
    include: {
      homeGame: {
        include: { host: { select: { id: true, name: true } } },
      },
    },
    orderBy: { joinedAt: 'desc' },
  })
}

export async function deleteHomeGame(homeGameId: string, hostId: string) {
  const game = await prisma.homeGame.findUniqueOrThrow({ where: { id: homeGameId } })
  if (game.hostId !== hostId) throw new Error('Acesso negado')

  await prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({ where: { session: { homeGameId } } })
    await tx.playerSessionState.deleteMany({ where: { session: { homeGameId } } })
    await tx.sessionStaff.deleteMany({ where: { session: { homeGameId } } })
    await tx.sessionParticipant.deleteMany({ where: { session: { homeGameId } } })
    await tx.session.deleteMany({ where: { homeGameId } })
    await tx.homeGameMember.deleteMany({ where: { homeGameId } })
    await tx.homeGame.delete({ where: { id: homeGameId } })
  })
}
