import { prisma } from '../../lib/prisma'
import { generateJoinCode } from '../../utils/codeGenerator'

export async function createHomeGame(hostId: string, data: {
  name: string
  address: string
  dayOfWeek: string
  startTime: string
  chipValue: number
  rules?: string
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
    data: { ...data, hostId, joinCode },
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
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { sessions: true } },
    },
  })
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
