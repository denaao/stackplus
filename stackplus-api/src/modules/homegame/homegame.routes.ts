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

const enableSangeurSchema = z.object({
  userId: z.string().uuid(),
  username: z.string().trim().min(3).max(40),
  password: z.string().trim().min(6).max(120).optional(),
})

const resetSangeurPasswordSchema = z.object({
  password: z.string().trim().min(6).max(120).optional(),
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
  const game = await HomeGameService.getHomeGameByIdForUser(req.params.id, req.user!.userId)
  res.json(game)
})

router.patch('/:id/financial-config', authenticate, async (req: AuthRequest, res: Response) => {
  const data = financialConfigSchema.parse(req.body)
  const game = await HomeGameService.updateFinancialConfig(req.params.id, req.user!.userId, data)
  res.json(game)
})

router.get('/:id/sangeurs', authenticate, async (req: AuthRequest, res: Response) => {
  const accesses = await HomeGameService.listSangeurAccesses(req.params.id, req.user!.userId)
  res.json(accesses)
})

router.post('/:id/sangeurs', authenticate, async (req: AuthRequest, res: Response) => {
  const data = enableSangeurSchema.parse(req.body)
  const result = await HomeGameService.enableSangeurAccess({
    homeGameId: req.params.id,
    hostId: req.user!.userId,
    memberUserId: data.userId,
    username: data.username,
    password: data.password,
  })
  res.status(201).json(result)
})

router.patch('/:id/sangeurs/:userId/disable', authenticate, async (req: AuthRequest, res: Response) => {
  const access = await HomeGameService.disableSangeurAccess(req.params.id, req.user!.userId, req.params.userId)
  res.json(access)
})

router.patch('/:id/sangeurs/:userId/reset-password', authenticate, async (req: AuthRequest, res: Response) => {
  const data = resetSangeurPasswordSchema.parse(req.body)
  const result = await HomeGameService.resetSangeurPassword({
    homeGameId: req.params.id,
    hostId: req.user!.userId,
    memberUserId: req.params.userId,
    password: data.password,
  })
  res.json(result)
})

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  await HomeGameService.deleteHomeGame(req.params.id, req.user!.userId)
  res.status(204).send()
})

const setMemberRoleSchema = z.object({
  role: z.enum(['HOST', 'PLAYER']),
})

router.patch('/:id/members/:userId/role', authenticate, async (req: AuthRequest, res: Response) => {
  const data = setMemberRoleSchema.parse(req.body)
  const result = await HomeGameService.setMemberRole({
    homeGameId: req.params.id,
    ownerUserId: req.user!.userId,
    memberUserId: req.params.userId,
    role: data.role,
  })
  res.json(result)
})

router.post('/join', authenticate, async (req: AuthRequest, res: Response) => {
  const { joinCode } = z.object({ joinCode: z.string().length(6) }).parse(req.body)
  const game = await HomeGameService.joinHomeGame(req.user!.userId, joinCode.toUpperCase())
  res.json(game)
})

export default router
