import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import * as RankingService from './ranking.service'

const router = Router()

router.get('/session/:sessionId', authenticate, async (req: AuthRequest, res: Response) => {
  const ranking = await RankingService.getRanking(req.params.sessionId)
  res.json(ranking)
})

router.get('/home-game/:homeGameId', authenticate, async (req: AuthRequest, res: Response) => {
  const ranking = await RankingService.getHomeGameRanking(req.params.homeGameId)
  res.json(ranking)
})

router.get('/home-game/:homeGameId/monthly', authenticate, async (req: AuthRequest, res: Response) => {
  const ranking = await RankingService.getMonthlyRanking(req.params.homeGameId)
  res.json(ranking)
})

export default router
