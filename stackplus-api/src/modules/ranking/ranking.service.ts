import { prisma } from '../../lib/prisma'

export async function getRanking(sessionId: string) {
  return prisma.playerSessionState.findMany({
    where: { sessionId },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { result: 'desc' },
  })
}

export async function getHomeGameRanking(homeGameId: string) {
  const members = await prisma.homeGameMember.findMany({
    where: { homeGameId },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  })

  const results = await Promise.all(
    members.map(async (m) => {
      const states = await prisma.playerSessionState.findMany({
        where: { userId: m.userId, session: { homeGameId, status: 'FINISHED' } },
      })
      const totalResult = states.reduce((acc, s) => acc + Number(s.result), 0)
      const sessions = states.length
      return { user: m.user, totalResult, sessions }
    })
  )

  return results.sort((a, b) => b.totalResult - a.totalResult)
}

export async function getMonthlyRanking(homeGameId: string) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const members = await prisma.homeGameMember.findMany({
    where: { homeGameId },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  })

  const results = await Promise.all(
    members.map(async (m) => {
      const states = await prisma.playerSessionState.findMany({
        where: {
          userId: m.userId,
          session: {
            homeGameId,
            status: 'FINISHED',
            finishedAt: { gte: startOfMonth },
          },
        },
      })
      const totalResult = states.reduce((acc, s) => acc + Number(s.result), 0)
      const sessions = states.length
      return { user: m.user, totalResult, sessions }
    })
  )

  return results.sort((a, b) => b.totalResult - a.totalResult)
}
