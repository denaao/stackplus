import { Router, Response } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import * as TournamentService from './tournament.service'

const router = Router()
router.use(authenticate)

const blindLevelSchema = z.object({
  level: z.number().int().positive(),
  smallBlind: z.number().int().positive(),
  bigBlind: z.number().int().positive(),
  ante: z.number().int().nonnegative().default(0),
})

// POST /tournaments
router.post('/', async (req: AuthRequest, res: Response) => {
  const data = z.object({
    homeGameId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    buyInAmount: z.number().positive(),
    rebuyAmount: z.number().positive().optional().nullable(),
    addonAmount: z.number().positive().optional().nullable(),
    bountyAmount: z.number().positive().optional().nullable(),
    rake: z.number().min(0).max(100).optional(),
    startingChips: z.number().int().positive(),
    rebuyChips: z.number().int().positive().optional().nullable(),
    addonChips: z.number().int().positive().optional().nullable(),
    lateRegistrationLevel: z.number().int().positive().optional().nullable(),
    rebuyUntilLevel: z.number().int().positive().optional().nullable(),
    addonAfterLevel: z.number().int().positive().optional().nullable(),
    minutesPerLevelPreLateReg: z.number().int().positive(),
    minutesPerLevelPostLateReg: z.number().int().positive().optional().nullable(),
    breaks: z.array(z.object({ afterLevel: z.number().int().positive(), durationMinutes: z.number().int().positive() })).optional(),
    buyInTaxAmount: z.number().positive().optional().nullable(),
    buyInTaxChips: z.number().int().positive().optional().nullable(),
    rebuyTaxAmount: z.number().positive().optional().nullable(),
    rebuyTaxChips: z.number().int().positive().optional().nullable(),
    addonTaxAmount: z.number().positive().optional().nullable(),
    addonTaxChips: z.number().int().positive().optional().nullable(),
    blindTemplateName: z.string().optional().nullable(),
    blindLevels: z.array(blindLevelSchema).optional(),
    doubleBuyInBonusChips: z.number().int().positive().optional().nullable(),
    doubleRebuyEnabled: z.boolean().optional(),
  }).parse(req.body)

  const tournament = await TournamentService.createTournament(data)
  res.status(201).json(tournament)
})

// GET /tournaments?homeGameId=...&status=...
router.get('/', async (req: AuthRequest, res: Response) => {
  const homeGameId = z.string().uuid().parse(req.query.homeGameId)
  const status = z.enum(['REGISTRATION', 'RUNNING', 'ON_BREAK', 'FINISHED', 'CANCELED']).optional().parse(req.query.status)
  const tournaments = await TournamentService.listTournaments({ homeGameId, status })
  res.json(tournaments)
})

// GET /tournaments/blind-templates
router.get('/blind-templates', async (_req: AuthRequest, res: Response) => {
  const templates = Object.entries(TournamentService.BLIND_TEMPLATES).map(([name, levels]) => ({
    name,
    levels,
  }))
  res.json(templates)
})

// GET /tournaments/:tournamentId
router.get('/:tournamentId', async (req: AuthRequest, res: Response) => {
  const tournament = await TournamentService.getTournament(req.params.tournamentId)
  res.json(tournament)
})

// POST /tournaments/:tournamentId/start
router.post('/:tournamentId/start', async (req: AuthRequest, res: Response) => {
  const tournament = await TournamentService.startTournament(req.params.tournamentId)
  res.json(tournament)
})

// POST /tournaments/:tournamentId/previous-level
router.post('/:tournamentId/previous-level', async (req: AuthRequest, res: Response) => {
  const tournament = await TournamentService.previousLevel(req.params.tournamentId)
  res.json(tournament)
})

// POST /tournaments/:tournamentId/advance-level
router.post('/:tournamentId/advance-level', async (req: AuthRequest, res: Response) => {
  const tournament = await TournamentService.advanceLevel(req.params.tournamentId)
  res.json(tournament)
})

// POST /tournaments/:tournamentId/start-break
router.post('/:tournamentId/start-break', async (req: AuthRequest, res: Response) => {
  const tournament = await TournamentService.startBreak(req.params.tournamentId)
  res.json(tournament)
})

// POST /tournaments/:tournamentId/end-break
router.post('/:tournamentId/end-break', async (req: AuthRequest, res: Response) => {
  const tournament = await TournamentService.endBreak(req.params.tournamentId)
  res.json(tournament)
})

// POST /tournaments/:tournamentId/finish-by-deal
router.post('/:tournamentId/finish-by-deal', async (req: AuthRequest, res: Response) => {
  const tournament = await TournamentService.finishByDeal(req.params.tournamentId)
  res.json(tournament)
})

// POST /tournaments/:tournamentId/set-deal-payouts
// Salva acordo de posições sem encerrar o torneio
router.post('/:tournamentId/set-deal-payouts', async (req: AuthRequest, res: Response) => {
  const { payouts } = z.object({
    payouts: z.array(z.object({
      position: z.number().int().positive(),
      amount: z.number().positive(),
    })).min(1),
  }).parse(req.body)
  const tournament = await TournamentService.setDealPayouts(req.params.tournamentId, payouts)
  res.json(tournament)
})

// POST /tournaments/:tournamentId/set-payout-structure
// Salva estrutura de payout (posições + percentuais) para exibição no clock
router.post('/:tournamentId/set-payout-structure', async (req: AuthRequest, res: Response) => {
  const { structure } = z.object({
    structure: z.array(z.object({
      position: z.number().int().positive(),
      percent: z.number().positive(),
    })).min(1),
  }).parse(req.body)
  const tournament = await TournamentService.setPayoutStructure(req.params.tournamentId, structure)
  res.json(tournament)
})

// POST /tournaments/:tournamentId/pause
router.post('/:tournamentId/pause', async (req: AuthRequest, res: Response) => {
  const tournament = await TournamentService.pauseTimer(req.params.tournamentId)
  res.json(tournament)
})

// POST /tournaments/:tournamentId/resume
router.post('/:tournamentId/resume', async (req: AuthRequest, res: Response) => {
  const tournament = await TournamentService.resumeTimer(req.params.tournamentId)
  res.json(tournament)
})

// PATCH /tournaments/:tournamentId (update during REGISTRATION)
router.patch('/:tournamentId', async (req: AuthRequest, res: Response) => {
  const data = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    buyInAmount: z.number().positive().optional(),
    rebuyAmount: z.number().positive().optional().nullable(),
    addonAmount: z.number().positive().optional().nullable(),
    bountyAmount: z.number().positive().optional().nullable(),
    rake: z.number().min(0).max(100).optional(),
    startingChips: z.number().int().positive().optional(),
    rebuyChips: z.number().int().positive().optional().nullable(),
    addonChips: z.number().int().positive().optional().nullable(),
    lateRegistrationLevel: z.number().int().positive().optional().nullable(),
    rebuyUntilLevel: z.number().int().positive().optional().nullable(),
    addonAfterLevel: z.number().int().positive().optional().nullable(),
    minutesPerLevelPreLateReg: z.number().int().positive().optional(),
    minutesPerLevelPostLateReg: z.number().int().positive().optional().nullable(),
    breaks: z.array(z.object({ afterLevel: z.number().int().positive(), durationMinutes: z.number().int().positive() })).optional(),
    buyInTaxAmount: z.number().positive().optional().nullable(),
    buyInTaxChips: z.number().int().positive().optional().nullable(),
    rebuyTaxAmount: z.number().positive().optional().nullable(),
    rebuyTaxChips: z.number().int().positive().optional().nullable(),
    addonTaxAmount: z.number().positive().optional().nullable(),
    addonTaxChips: z.number().int().positive().optional().nullable(),
    blindLevels: z.array(blindLevelSchema).optional(),
    doubleBuyInBonusChips: z.number().int().positive().optional().nullable(),
    doubleRebuyEnabled: z.boolean().optional(),
  }).parse(req.body)

  const tournament = await TournamentService.updateTournament(req.params.tournamentId, data)
  res.json(tournament)
})

// PATCH /tournaments/:tournamentId/limits (rebuyUntilLevel / addonAfterLevel — editável durante RUNNING)
router.patch('/:tournamentId/limits', async (req: AuthRequest, res: Response) => {
  const data = z.object({
    rebuyUntilLevel: z.number().int().positive().optional().nullable(),
    addonAfterLevel: z.number().int().positive().optional().nullable(),
  }).parse(req.body)
  const tournament = await TournamentService.updateLimits(req.params.tournamentId, data)
  res.json(tournament)
})

// PATCH /tournaments/:tournamentId/blind-levels
router.patch('/:tournamentId/blind-levels', async (req: AuthRequest, res: Response) => {
  const { levels, breaks } = z.object({
    levels: z.array(blindLevelSchema),
    breaks: z.array(z.object({ afterLevel: z.number().int().positive(), durationMinutes: z.number().int().positive() })).optional(),
  }).parse(req.body)
  await TournamentService.updateBlindLevels(req.params.tournamentId, levels, breaks)
  const tournament = await TournamentService.getTournament(req.params.tournamentId)
  res.json(tournament)
})

// POST /tournaments/:tournamentId/cancel
router.post('/:tournamentId/cancel', async (req: AuthRequest, res: Response) => {
  const tournament = await TournamentService.cancelTournament(req.params.tournamentId)
  res.json(tournament)
})

// GET /tournaments/:tournamentId/payout-suggestion
router.get('/:tournamentId/payout-suggestion', async (req: AuthRequest, res: Response) => {
  const tournament = await TournamentService.getTournament(req.params.tournamentId)
  const playerCount = tournament.players.filter(
    (p: any) => !['ELIMINATED'].includes(p.status) || true // conta todos os inscritos
  ).length
  const suggestion = TournamentService.calcPayoutSuggestion(
    Number(tournament.prizePool),
    playerCount,
  )
  res.json({ prizePool: tournament.prizePool, suggestion })
})

// POST /tournaments/:tournamentId/players (register player)
router.post('/:tournamentId/players', async (req: AuthRequest, res: Response) => {
  const data = z.object({
    playerId: z.string().uuid(),
    homeGameId: z.string().uuid(),
    buyInType: z.enum(['NORMAL', 'NORMAL_WITH_TAX', 'DOUBLE']).optional(),
  }).parse(req.body)

  const player = await TournamentService.registerPlayer({
    tournamentId: req.params.tournamentId,
    playerId: data.playerId,
    homeGameId: data.homeGameId,
    registeredByUserId: req.user!.userId,
    buyInType: data.buyInType ?? 'NORMAL',
  })
  res.status(201).json(player)
})

// DELETE /tournaments/players/:tournamentPlayerId (cancel registration)
router.delete('/players/:tournamentPlayerId', async (req: AuthRequest, res: Response) => {
  const result = await TournamentService.cancelRegistration({
    tournamentPlayerId: req.params.tournamentPlayerId,
    registeredByUserId: req.user!.userId,
  })
  res.json(result)
})

// POST /tournaments/players/:tournamentPlayerId/rebuy
router.post('/players/:tournamentPlayerId/rebuy', async (req: AuthRequest, res: Response) => {
  const { rebuyType } = z.object({
    rebuyType: z.enum(['NORMAL', 'NORMAL_WITH_TAX', 'DOUBLE']).optional(),
  }).parse(req.body)
  const result = await TournamentService.registerRebuy({
    tournamentPlayerId: req.params.tournamentPlayerId,
    registeredByUserId: req.user!.userId,
    rebuyType: rebuyType ?? 'NORMAL',
  })
  res.json(result)
})

// POST /tournaments/players/:tournamentPlayerId/re-entry
router.post('/players/:tournamentPlayerId/re-entry', async (req: AuthRequest, res: Response) => {
  const { reEntryType, withAddon } = z.object({
    reEntryType: z.enum(['NORMAL', 'DOUBLE']).optional(),
    withAddon: z.boolean().optional(),
  }).parse(req.body)
  const result = await TournamentService.reEntryPlayer({
    tournamentPlayerId: req.params.tournamentPlayerId,
    registeredByUserId: req.user!.userId,
    reEntryType: reEntryType ?? 'NORMAL',
    withAddon: withAddon ?? false,
  })
  res.json(result)
})

// POST /tournaments/players/:tournamentPlayerId/addon
router.post('/players/:tournamentPlayerId/addon', async (req: AuthRequest, res: Response) => {
  const { withTax } = z.object({ withTax: z.boolean().optional() }).parse(req.body)
  const result = await TournamentService.registerAddon({
    tournamentPlayerId: req.params.tournamentPlayerId,
    registeredByUserId: req.user!.userId,
    withTax: withTax ?? false,
  })
  res.json(result)
})

// POST /tournaments/players/:tournamentPlayerId/eliminate
router.post('/players/:tournamentPlayerId/eliminate', async (req: AuthRequest, res: Response) => {
  const data = z.object({
    eliminatedByPlayerId: z.string().uuid().optional().nullable(),
    position: z.number().int().positive().optional(),
  }).parse(req.body)

  const result = await TournamentService.eliminatePlayer({
    tournamentPlayerId: req.params.tournamentPlayerId,
    eliminatedByPlayerId: data.eliminatedByPlayerId,
    registeredByUserId: req.user!.userId,
  })
  res.json(result)
})

// POST /tournaments/players/:tournamentPlayerId/prize
router.post('/players/:tournamentPlayerId/prize', async (req: AuthRequest, res: Response) => {
  const { prizeAmount } = z.object({ prizeAmount: z.number().positive() }).parse(req.body)

  await TournamentService.awardPrize({
    tournamentPlayerId: req.params.tournamentPlayerId,
    prizeAmount,
    registeredByUserId: req.user!.userId,
  })
  res.json({ ok: true })
})

export default router
