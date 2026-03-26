import { Router, Response } from 'express'
import { authenticate, authorize, AuthRequest } from '../../middlewares/auth.middleware'
import * as UsersService from './users.service'

const router = Router()

router.get('/', authenticate, authorize('ADMIN'), async (req, res: Response) => {
  const users = await UsersService.getAllUsers()
  res.json(users)
})

router.patch('/:id/role', authenticate, authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  const user = await UsersService.updateUserRole(req.params.id, req.body.role)
  res.json(user)
})

router.get('/:id/stats', authenticate, async (req: AuthRequest, res: Response) => {
  const stats = await UsersService.getUserStats(req.params.id)
  res.json(stats)
})

router.get('/:id/history', authenticate, async (req: AuthRequest, res: Response) => {
  const history = await UsersService.getUserHistory(req.params.id)
  res.json(history)
})

export default router
