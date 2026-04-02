import { Router, Response } from 'express'
import { authenticate, authorize, AuthRequest } from '../../middlewares/auth.middleware'
import * as UsersService from './users.service'

const router = Router()

function canAccessOwnUserData(req: AuthRequest, targetUserId: string) {
  return req.user?.role === 'ADMIN' || req.user?.userId === targetUserId
}

router.get('/', authenticate, authorize('ADMIN'), async (req, res: Response) => {
  const users = await UsersService.getAllUsers()
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
