import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import { prisma } from '../../lib/prisma'
import { isHomeGameHost } from '../../lib/homegame-auth'

const router = Router()

router.get('/:homeGameId/members', authenticate, async (req: AuthRequest, res: Response) => {
  const homeGame = await prisma.homeGame.findUnique({
    where: { id: req.params.homeGameId },
    select: { id: true, hostId: true },
  })

  if (!homeGame) {
    res.status(404).json({ error: 'Home Game não encontrado' })
    return
  }

  const isHost = await isHomeGameHost(req.user!.userId, req.params.homeGameId)
  const isMember = await prisma.homeGameMember.findUnique({
    where: { homeGameId_userId: { homeGameId: req.params.homeGameId, userId: req.user!.userId } },
    select: { id: true },
  })

  if (!isHost && !isMember) {
    res.status(403).json({ error: 'Acesso negado' })
    return
  }

  const members = await prisma.homeGameMember.findMany({
    where: { homeGameId: req.params.homeGameId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { joinedAt: 'asc' },
  })
  res.json(members)
})

router.delete('/:homeGameId/members/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  const homeGame = await prisma.homeGame.findUnique({
    where: { id: req.params.homeGameId },
    select: { id: true, hostId: true },
  })

  if (!homeGame) {
    res.status(404).json({ error: 'Home Game não encontrado' })
    return
  }

  const isHost = await isHomeGameHost(req.user!.userId, req.params.homeGameId)

  if (!isHost) {
    res.status(403).json({ error: 'Acesso negado' })
    return
  }

  // O dono original nao pode ser removido do home game (ownership imutavel).
  if (req.params.userId === homeGame.hostId) {
    res.status(400).json({ error: 'O dono do Home Game nao pode ser removido' })
    return
  }

  await prisma.homeGameMember.deleteMany({
    where: { homeGameId: req.params.homeGameId, userId: req.params.userId },
  })
  res.status(204).send()
})

export default router
