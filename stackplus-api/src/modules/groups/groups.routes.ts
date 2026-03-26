import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import { prisma } from '../../lib/prisma'

const router = Router()

router.get('/:homeGameId/members', authenticate, async (req: AuthRequest, res: Response) => {
  const members = await prisma.homeGameMember.findMany({
    where: { homeGameId: req.params.homeGameId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { joinedAt: 'asc' },
  })
  res.json(members)
})

router.delete('/:homeGameId/members/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  await prisma.homeGameMember.deleteMany({
    where: { homeGameId: req.params.homeGameId, userId: req.params.userId },
  })
  res.status(204).send()
})

export default router
