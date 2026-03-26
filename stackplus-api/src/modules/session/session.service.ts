import { prisma } from '../../lib/prisma'

export async function createSession(homeGameId: string, hostId: string) {
  const game = await prisma.homeGame.findUniqueOrThrow({ where: { id: homeGameId } })
  if (game.hostId !== hostId) throw new Error('Apenas o host pode criar sessões')

  return prisma.session.create({
    data: { homeGameId, status: 'WAITING' },
    include: { homeGame: true },
  })
}

export async function startSession(sessionId: string, hostId: string, cashierId?: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: { homeGame: true },
  })
  if (session.homeGame.hostId !== hostId) throw new Error('Acesso negado')
  if (session.status !== 'WAITING') throw new Error('Sessão já iniciada')

  return prisma.session.update({
    where: { id: sessionId },
    data: { status: 'ACTIVE', startedAt: new Date(), cashierId: cashierId || null },
    include: { homeGame: true, cashier: { select: { id: true, name: true } } },
  })
}

export async function finishSession(sessionId: string, hostId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: { homeGame: true },
  })
  if (session.homeGame.hostId !== hostId) throw new Error('Acesso negado')
  if (session.status !== 'ACTIVE') throw new Error('Sessão não está ativa')

  return prisma.session.update({
    where: { id: sessionId },
    data: { status: 'FINISHED', finishedAt: new Date() },
    include: {
      homeGame: true,
      playerStates: { include: { user: { select: { id: true, name: true } } } },
    },
  })
}

export async function getSessionById(sessionId: string) {
  return prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      homeGame: true,
      cashier: { select: { id: true, name: true } },
      playerStates: {
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { result: 'desc' },
      },
    },
  })
}

export async function getSessionsByHomeGame(homeGameId: string) {
  return prisma.session.findMany({
    where: { homeGameId },
    include: { _count: { select: { playerStates: true, transactions: true } } },
    orderBy: { createdAt: 'desc' },
  })
}
