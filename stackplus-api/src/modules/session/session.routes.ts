import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import * as SessionService from './session.service'
import { z } from 'zod'
import { emitSessionFinished } from '../../socket/socket'

const router = Router()

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const {
    homeGameId,
    pokerVariant,
    gameType,
    financialModule,
    chipValue,
    smallBlind,
    bigBlind,
    minimumBuyIn,
    minimumStayMinutes,
    foodFee,
    jackpotEnabled,
    buyInAmount,
    rebuyAmount,
    addOnAmount,
    blindsMinutesBeforeBreak,
    blindsMinutesAfterBreak,
    levelsUntilBreak,
  } = z.object({
    homeGameId: z.string().uuid(),
    pokerVariant: z.enum(['HOLDEN', 'BUTTON_CHOICE', 'PINEAPPLE', 'OMAHA', 'OMAHA_FIVE', 'OMAHA_SIX']).optional(),
    gameType: z.enum(['CASH_GAME', 'TOURNAMENT']).optional(),
    financialModule: z.enum(['POSTPAID', 'PREPAID', 'HYBRID']).optional(),
    chipValue: z.number().positive().optional(),
    smallBlind: z.number().nonnegative().optional(),
    bigBlind: z.number().nonnegative().optional(),
    minimumBuyIn: z.number().nonnegative().optional(),
    minimumStayMinutes: z.number().int().nonnegative().optional(),
    foodFee: z.number().nonnegative().optional(),
    jackpotEnabled: z.boolean().optional(),
    buyInAmount: z.number().nonnegative().optional(),
    rebuyAmount: z.number().nonnegative().optional(),
    addOnAmount: z.number().nonnegative().optional(),
    blindsMinutesBeforeBreak: z.number().int().positive().optional(),
    blindsMinutesAfterBreak: z.number().int().positive().optional(),
    levelsUntilBreak: z.number().int().positive().optional(),
  }).parse(req.body)

  const session = await SessionService.createSession(homeGameId, req.user!.userId, {
    pokerVariant,
    gameType,
    financialModule,
    chipValue,
    smallBlind,
    bigBlind,
    minimumBuyIn,
    minimumStayMinutes,
    foodFee,
    jackpotEnabled,
    buyInAmount,
    rebuyAmount,
    addOnAmount,
    blindsMinutesBeforeBreak,
    blindsMinutesAfterBreak,
    levelsUntilBreak,
  })
  res.status(201).json(session)
})

router.get('/home-game/:homeGameId', authenticate, async (req: AuthRequest, res: Response) => {
  const sessions = await SessionService.getSessionsByHomeGameForUser(req.params.homeGameId, req.user!.userId)
  res.json(sessions)
})

router.get('/public/:id', async (req: AuthRequest, res: Response) => {
  const session = await SessionService.getPublicSessionById(req.params.id)
  res.json(session)
})

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const session = await SessionService.getSessionByIdForOperator(req.params.id, req.user!.userId)
  res.json(session)
})

router.get('/:id/staff', authenticate, async (req: AuthRequest, res: Response) => {
  const users = await SessionService.getSessionStaffOptions(req.params.id, req.user!.userId)
  res.json(users)
})

router.get('/:id/participants/options', authenticate, async (req: AuthRequest, res: Response) => {
  const users = await SessionService.getSessionParticipantOptions(req.params.id, req.user!.userId)
  res.json(users)
})

router.patch('/:id/start', authenticate, async (req: AuthRequest, res: Response) => {
  const { cashierId } = z.object({ cashierId: z.string().uuid().optional() }).parse(req.body)
  const session = await SessionService.startSession(req.params.id, req.user!.userId, cashierId)
  res.json(session)
})

router.patch('/:id/finish', authenticate, async (req: AuthRequest, res: Response) => {
  const session = await SessionService.finishSession(req.params.id, req.user!.userId)
  emitSessionFinished(req.params.id)
  res.json(session)
})

router.patch('/:id/end', authenticate, async (req: AuthRequest, res: Response) => {
  const { rake, caixinha, caixinhaByStaff, jackpotArrecadado } = z.object({
    rake: z.number().nonnegative(),
    caixinha: z.number().nonnegative().optional(),
    caixinhaByStaff: z.array(z.object({
      userId: z.string().uuid(),
      amount: z.number().nonnegative(),
    })).optional(),
    jackpotArrecadado: z.number().nonnegative().optional(),
  }).parse(req.body)
  const session = await SessionService.finishSession(req.params.id, req.user!.userId, { rake, caixinha, caixinhaByStaff, jackpotArrecadado })
  emitSessionFinished(req.params.id)
  res.json(session)
})

router.put('/:id/staff', authenticate, async (req: AuthRequest, res: Response) => {
  const { userIds, caixinhaMode } = z.object({
    userIds: z.array(z.string().uuid()),
    caixinhaMode: z.enum(['SPLIT', 'INDIVIDUAL']).optional(),
  }).parse(req.body)
  const session = await SessionService.updateSessionStaff(req.params.id, req.user!.userId, userIds, caixinhaMode)
  res.json(session)
})

router.put('/:id/rakeback', authenticate, async (req: AuthRequest, res: Response) => {
  const { assignments } = z.object({
    assignments: z.array(z.object({
      userId: z.string().uuid(),
      percent: z.number().min(0).max(100),
    })),
  }).parse(req.body)
  const session = await SessionService.updateSessionRakeback(req.params.id, req.user!.userId, assignments)
  res.json(session)
})

router.put('/:id/participants', authenticate, async (req: AuthRequest, res: Response) => {
  const { userIds } = z.object({ userIds: z.array(z.string().uuid()) }).parse(req.body)
  const session = await SessionService.updateSessionParticipants(req.params.id, req.user!.userId, userIds)
  res.json(session)
})

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await SessionService.deleteSession(req.params.id, req.user!.userId)
    res.status(204).send()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'

    if (message.includes('Acesso negado')) {
      res.status(403).json({ error: message })
      return
    }

    if (message.includes('No Session found')) {
      res.status(404).json({ error: 'Sessao nao encontrada' })
      return
    }

    throw error
  }
})

export default router
