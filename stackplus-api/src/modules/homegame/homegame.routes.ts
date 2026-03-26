import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import * as HomeGameService from './homegame.service'
import { z } from 'zod'

const router = Router()

const createSchema = z.object({
  name: z.string().min(2),
  address: z.string().min(5),
  dayOfWeek: z.string(),
  startTime: z.string(),
  chipValue: z.number().positive(),
  rules: z.string().optional(),
})

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const data = createSchema.parse(req.body)
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

router.post('/join', authenticate, async (req: AuthRequest, res: Response) => {
  const { joinCode } = z.object({ joinCode: z.string().length(6) }).parse(req.body)
  const game = await HomeGameService.joinHomeGame(req.user!.userId, joinCode.toUpperCase())
  res.json(game)
})

export default router
