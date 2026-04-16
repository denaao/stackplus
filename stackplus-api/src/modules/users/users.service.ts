import { prisma } from '../../lib/prisma'

export async function getAllUsers() {
  return prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function updateUserRole(userId: string, role: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { role: role as any },
    select: { id: true, name: true, email: true, role: true },
  })
}

export async function getUserStats(userId: string) {
  const [aggregate, wins, losses] = await Promise.all([
    prisma.playerSessionState.aggregate({
      where: { userId },
      _count: { _all: true },
      _sum: { result: true },
    }),
    prisma.playerSessionState.count({
      where: {
        userId,
        result: { gt: 0 },
      },
    }),
    prisma.playerSessionState.count({
      where: {
        userId,
        result: { lt: 0 },
      },
    }),
  ])

  const totalSessions = aggregate._count._all
  const totalResult = Number(aggregate._sum.result || 0)

  return { totalSessions, totalResult, wins, losses }
}

export async function getUserHistory(userId: string) {
  return prisma.playerSessionState.findMany({
    where: { userId, session: { status: 'FINISHED' } },
    include: {
      session: {
        include: { homeGame: { select: { name: true } } },
      },
    },
    orderBy: { session: { finishedAt: 'desc' } },
  })
}
