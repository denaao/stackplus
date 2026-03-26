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
  const states = await prisma.playerSessionState.findMany({
    where: { userId },
    include: { session: { include: { homeGame: true } } },
  })

  const totalSessions = states.length
  const totalResult = states.reduce((acc, s) => acc + Number(s.result), 0)
  const wins = states.filter((s) => Number(s.result) > 0).length
  const losses = states.filter((s) => Number(s.result) < 0).length

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
