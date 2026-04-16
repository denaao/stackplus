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

  const grouped = await prisma.playerSessionState.groupBy({
    by: ['userId'],
    where: {
      session: {
        homeGameId,
        status: 'FINISHED',
      },
    },
    _sum: {
      result: true,
    },
    _count: {
      _all: true,
    },
  })

  const groupedByUserId = new Map(
    grouped.map((row) => [
      row.userId,
      {
        totalResult: Number(row._sum.result || 0),
        sessions: row._count._all,
      },
    ])
  )

  const results = members.map((m) => {
    const agg = groupedByUserId.get(m.userId)
    return {
      user: m.user,
      totalResult: agg?.totalResult || 0,
      sessions: agg?.sessions || 0,
    }
  })

  return results.sort((a, b) => b.totalResult - a.totalResult)
}

export async function getMonthlyRanking(homeGameId: string) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const members = await prisma.homeGameMember.findMany({
    where: { homeGameId },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  })

  const grouped = await prisma.playerSessionState.groupBy({
    by: ['userId'],
    where: {
      session: {
        homeGameId,
        status: 'FINISHED',
        finishedAt: { gte: startOfMonth },
      },
    },
    _sum: {
      result: true,
    },
    _count: {
      _all: true,
    },
  })

  const groupedByUserId = new Map(
    grouped.map((row) => [
      row.userId,
      {
        totalResult: Number(row._sum.result || 0),
        sessions: row._count._all,
      },
    ])
  )

  const results = members.map((m) => {
    const agg = groupedByUserId.get(m.userId)
    return {
      user: m.user,
      totalResult: agg?.totalResult || 0,
      sessions: agg?.sessions || 0,
    }
  })

  return results.sort((a, b) => b.totalResult - a.totalResult)
}
