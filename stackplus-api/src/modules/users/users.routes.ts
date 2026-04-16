import { Router, Response } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../../middlewares/auth.middleware'
import * as UsersService from './users.service'
import { prisma } from '../../lib/prisma'

const router = Router()

function canAccessOwnUserData(req: AuthRequest, targetUserId: string) {
  return req.user?.role === 'ADMIN' || req.user?.userId === targetUserId
}

router.get('/', authenticate, authorize('ADMIN'), async (req, res: Response) => {
  const users = await UsersService.getAllUsers()
  res.json(users)
})

// Busca de usuários por nome ou CPF (para inscrição em torneios, etc.)
router.get('/search', authenticate, async (req: AuthRequest, res: Response) => {
  const q = z.string().min(2).max(100).parse(req.query.q)
  const cleanCpf = q.replace(/\D/g, '')

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        ...(cleanCpf.length >= 3 ? [{ cpf: { contains: cleanCpf } }] : []),
      ],
    },
    select: { id: true, name: true, cpf: true },
    take: 15,
    orderBy: { name: 'asc' },
  })
  res.json(users)
})

router.patch('/:id/role', authenticate, authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  const user = await UsersService.updateUserRole(req.params.id, req.body.role)
  res.json(user)
})

router.get('/:id/stats', authenticate, async (req: AuthRequest, res: Response) => {
  if (!canAccessOwnUserData(req, req.params.id)) {
    res.status(403).json({ error: 'Acesso negado' })
    return
  }

  const stats = await UsersService.getUserStats(req.params.id)
  res.json(stats)
})

router.get('/:id/history', authenticate, async (req: AuthRequest, res: Response) => {
  if (!canAccessOwnUserData(req, req.params.id)) {
    res.status(403).json({ error: 'Acesso negado' })
    return
  }

  const history = await UsersService.getUserHistory(req.params.id)
  res.json(history)
})

export default router
