import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import * as SessionService from './session.service'
import { z } from 'zod'

const router = Router()

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { homeGameId } = z.object({ homeGameId: z.string().uuid() }).parse(req.body)
  const session = await SessionService.createSession(homeGameId, req.user!.userId)
  res.status(201).json(session)
})

router.get('/home-game/:homeGameId', authenticate, async (req: AuthRequest, res: Response) => {
  const sessions = await SessionService.getSessionsByHomeGame(req.params.homeGameId)
  res.json(sessions)
})

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const session = await SessionService.getSessionById(req.params.id)
  res.json(session)
})

router.patch('/:id/start', authenticate, async (req: AuthRequest, res: Response) => {
  const { cashierId } = z.object({ cashierId: z.string().uuid().optional() }).parse(req.body)
  const session = await SessionService.startSession(req.params.id, req.user!.userId, cashierId)
  res.json(session)
})

router.patch('/:id/finish', authenticate, async (req: AuthRequest, res: Response) => {
  const session = await SessionService.finishSession(req.params.id, req.user!.userId)
  res.json(session)
})

export default router
