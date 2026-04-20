import { prisma } from '../../lib/prisma'
import { generateJoinCode } from '../../utils/codeGenerator'
import { hashPassword } from '../../utils/hash'
import { FinancialModule, MemberPaymentMode } from '@prisma/client'
import { randomBytes } from 'crypto'
import { isHomeGameHost, assertHomeGameHost, assertHomeGameOwner } from '../../lib/homegame-auth'

function generateTempPassword() {
  return randomBytes(6).toString('base64url')
}

export async function createHomeGame(hostId: string, data: {
  name: string
  gameType: 'CASH_GAME' | 'TOURNAMENT'
  financialModule?: FinancialModule
  address: string
  dayOfWeek: string
  startTime: string
  chipValue: number
  jackpotAccumulated?: number
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
  // Retorna home games em que o usuario eh dono original (hostId)
  // OU co-host (HomeGameMember com role = HOST).
  return prisma.homeGame.findMany({
    where: {
      OR: [
        { hostId },
        { members: { some: { userId: hostId, role: 'HOST' } } },
      ],
    },
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
      sangeurAccesses: {
        select: {
          id: true,
          homeGameId: true,
          userId: true,
          username: true,
          isActive: true,
          mustChangePassword: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      _count: { select: { sessions: true } },
    },
  })
}

export async function getHomeGameByIdForUser(id: string, userId: string) {
  const game = await getHomeGameById(id)

  const isHost = await isHomeGameHost(userId, id)
  const isMember = game.members.some((member) => member.userId === userId)

  if (!isHost && !isMember) {
    throw new Error('Acesso negado')
  }

  return game
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

  await assertHomeGameHost(hostId, homeGameId)

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

/**
 * Retorna todos os home games do usuario agrupados pelo papel que ele tem em cada.
 * - asOwner: home games onde ele eh dono original (HomeGame.hostId)
 * - asCoHost: home games onde ele eh HomeGameMember.role = HOST
 * - asPlayer: home games onde ele eh HomeGameMember.role = PLAYER
 */
export async function getMyHomeGamesWithRoles(userId: string) {
  const [ownerGames, memberEntries] = await Promise.all([
    prisma.homeGame.findMany({
      where: { hostId: userId },
      include: { _count: { select: { members: true, sessions: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.homeGameMember.findMany({
      where: { userId },
      include: {
        homeGame: {
          include: { _count: { select: { members: true, sessions: true } } },
        },
      },
      orderBy: { joinedAt: 'desc' },
    }),
  ])

  const coHostGames: typeof ownerGames = []
  const playerGames: typeof ownerGames = []
  for (const entry of memberEntries) {
    // Se o usuario tambem eh dono desse home game, ja esta em asOwner — nao duplica.
    if (entry.homeGame.hostId === userId) continue
    if (entry.role === 'HOST') coHostGames.push(entry.homeGame)
    else playerGames.push(entry.homeGame)
  }

  return {
    asOwner: ownerGames,
    asCoHost: coHostGames,
    asPlayer: playerGames,
  }
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

/**
 * Promove ou rebaixa um membro do home game.
 * Apenas o DONO ORIGINAL (hostId) pode invocar — co-hosts nao podem promover outros.
 * O proprio dono nao aparece em HomeGameMember e nao pode ser rebaixado.
 */
export async function setMemberRole(input: {
  homeGameId: string
  ownerUserId: string   // quem esta fazendo a chamada (tem que ser o dono)
  memberUserId: string  // quem sera promovido/rebaixado
  role: 'HOST' | 'PLAYER'
}) {
  await assertHomeGameOwner(input.ownerUserId, input.homeGameId)

  const homeGame = await prisma.homeGame.findUniqueOrThrow({
    where: { id: input.homeGameId },
    select: { hostId: true },
  })

  if (input.memberUserId === homeGame.hostId) {
    throw new Error('O dono original nao pode ter o papel alterado')
  }

  const member = await prisma.homeGameMember.findUnique({
    where: { homeGameId_userId: { homeGameId: input.homeGameId, userId: input.memberUserId } },
    select: { id: true },
  })
  if (!member) {
    throw new Error('Usuario nao e membro deste home game')
  }

  return prisma.homeGameMember.update({
    where: { homeGameId_userId: { homeGameId: input.homeGameId, userId: input.memberUserId } },
    data: { role: input.role },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  })
}

export async function deleteHomeGame(homeGameId: string, hostId: string) {
  // Apenas o dono original pode deletar (co-hosts nao podem).
  await assertHomeGameOwner(hostId, homeGameId)

  await prisma.$transaction(async (tx) => {
    await tx.prepaidChargePending.deleteMany({ where: { session: { homeGameId } } })
    await tx.sessionFinancialChargePending.deleteMany({ where: { session: { homeGameId } } })
    await tx.sessionFinancialPayoutPending.deleteMany({ where: { session: { homeGameId } } })
    await tx.sangeurSale.deleteMany({ where: { shift: { homeGameId } } })
    await tx.sangeurShiftMovement.deleteMany({ where: { shift: { homeGameId } } })
    await tx.sangeurShift.deleteMany({ where: { homeGameId } })
    await tx.homeGameSangeurAccess.deleteMany({ where: { homeGameId } })
    await tx.transaction.deleteMany({ where: { session: { homeGameId } } })
    await tx.playerSessionState.deleteMany({ where: { session: { homeGameId } } })
    await tx.sessionStaff.deleteMany({ where: { session: { homeGameId } } })
    await tx.sessionRakeback.deleteMany({ where: { session: { homeGameId } } })
    await tx.sessionParticipant.deleteMany({ where: { session: { homeGameId } } })
    await tx.session.deleteMany({ where: { homeGameId } })
    await tx.homeGameMember.deleteMany({ where: { homeGameId } })
    await tx.homeGame.delete({ where: { id: homeGameId } })
  })
}

async function ensureHostAndMember(homeGameId: string, hostId: string, memberUserId: string) {
  await assertHomeGameHost(hostId, homeGameId)

  const member = await prisma.homeGameMember.findUnique({
    where: {
      homeGameId_userId: {
        homeGameId,
        userId: memberUserId,
      },
    },
  })

  if (!member) throw new Error('Usuário precisa ser participante do Home Game para virar SANGEUR')
}

export async function listSangeurAccesses(homeGameId: string, hostId: string) {
  await assertHomeGameHost(hostId, homeGameId)

  return prisma.homeGameSangeurAccess.findMany({
    where: { homeGameId },
    select: {
      id: true,
      homeGameId: true,
      userId: true,
      username: true,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function enableSangeurAccess(input: {
  homeGameId: string
  hostId: string
  memberUserId: string
  username: string
  password?: string
}) {
  await ensureHostAndMember(input.homeGameId, input.hostId, input.memberUserId)

  const normalizedUsername = input.username.trim().toLowerCase()
  if (!normalizedUsername) throw new Error('Username é obrigatório')

  const plainPassword = (input.password?.trim() || generateTempPassword())
  if (plainPassword.length < 6) throw new Error('Senha deve ter no mínimo 6 caracteres')

  const passwordHash = await hashPassword(plainPassword)

  const access = await prisma.homeGameSangeurAccess.upsert({
    where: {
      homeGameId_userId: {
        homeGameId: input.homeGameId,
        userId: input.memberUserId,
      },
    },
    update: {
      username: normalizedUsername,
      passwordHash,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: null,
    },
    create: {
      homeGameId: input.homeGameId,
      userId: input.memberUserId,
      username: normalizedUsername,
      passwordHash,
      isActive: true,
      mustChangePassword: true,
    },
    select: {
      id: true,
      homeGameId: true,
      userId: true,
      username: true,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  })

  return {
    access,
    temporaryPassword: plainPassword,
  }
}

export async function disableSangeurAccess(homeGameId: string, hostId: string, memberUserId: string) {
  await ensureHostAndMember(homeGameId, hostId, memberUserId)

  const access = await prisma.homeGameSangeurAccess.update({
    where: {
      homeGameId_userId: {
        homeGameId,
        userId: memberUserId,
      },
    },
    data: {
      isActive: false,
    },
    select: {
      id: true,
      homeGameId: true,
      userId: true,
      username: true,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  })

  return access
}

export async function resetSangeurPassword(input: {
  homeGameId: string
  hostId: string
  memberUserId: string
  password?: string
}) {
  await ensureHostAndMember(input.homeGameId, input.hostId, input.memberUserId)

  const plainPassword = (input.password?.trim() || generateTempPassword())
  if (plainPassword.length < 6) throw new Error('Senha deve ter no mínimo 6 caracteres')
  const passwordHash = await hashPassword(plainPassword)

  const access = await prisma.homeGameSangeurAccess.update({
    where: {
      homeGameId_userId: {
        homeGameId: input.homeGameId,
        userId: input.memberUserId,
      },
    },
    data: {
      passwordHash,
      mustChangePassword: true,
      isActive: true,
      lastLoginAt: null,
    },
    select: {
      id: true,
      homeGameId: true,
      userId: true,
      username: true,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  })

  return {
    access,
    temporaryPassword: plainPassword,
  }
}
