import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import * as HomeGameService from './homegame.service'
import { z } from 'zod'

const router = Router()

const createSchema = z.object({
  name: z.string().min(2),
  address: z.string().min(5),
  financialModule: z.enum(['POSTPAID', 'PREPAID', 'HYBRID']).optional(),
})

const financialConfigSchema = z.object({
  financialModule: z.enum(['POSTPAID', 'PREPAID', 'HYBRID']),
  hybridMembers: z.array(z.object({
    userId: z.string().uuid(),
    paymentMode: z.enum(['POSTPAID', 'PREPAID']),
  })).optional(),
})

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.parse(req.body)
  const data = {
    ...parsed,
    gameType: 'CASH_GAME' as const,
    dayOfWeek: 'A combinar',
    startTime: '20:00',
    chipValue: 1,
    rules: undefined,
    buyInAmount: undefined,
    rebuyAmount: undefined,
    addOnAmount: undefined,
    blindsMinutesBeforeBreak: undefined,
    blindsMinutesAfterBreak: undefined,
    levelsUntilBreak: undefined,
  }
  const game = await HomeGameService.createHomeGame(req.user!.userId, data)
  res.status(201).json(game)
})

router.get('/mine', authenticate, async (req: AuthRequest, res: Response) => {
  const games = await HomeGameService.getHostGames(req.user!.userId)
  res.json(games)
})

router.get('/member', authenticate, async (req: AuthRequest, res: Response) => {
  const games = await HomeGameService.getPlayerGames(req.user!.userId)
  res.json(games)
})

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const game = await HomeGameService.getHomeGameById(req.params.id)
  res.json(game)
})

router.patch('/:id/financial-config', authenticate, async (req: AuthRequest, res: Response) => {
  const data = financialConfigSchema.parse(req.body)
  const game = await HomeGameService.updateFinancialConfig(req.params.id, req.user!.userId, data)
  res.json(game)
})

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  await HomeGameService.deleteHomeGame(req.params.id, req.user!.userId)
  res.status(204).send()
})

router.post('/join', authenticate, async (req: AuthRequest, res: Response) => {
  const { joinCode } = z.object({ joinCode: z.string().length(6) }).parse(req.body)
  const game = await HomeGameService.joinHomeGame(req.user!.userId, joinCode.toUpperCase())
  res.json(game)
})

export default router
