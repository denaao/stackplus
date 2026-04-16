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
  }).parse(req.body)

  const player = await TournamentService.registerPlayer({
    tournamentId: req.params.tournamentId,
    playerId: data.playerId,
    homeGameId: data.homeGameId,
    registeredByUserId: req.user!.userId,
  })
  res.status(201).json(player)
})

// POST /tournaments/players/:tournamentPlayerId/rebuy
router.post('/players/:tournamentPlayerId/rebuy', async (req: AuthRequest, res: Response) => {
  const result = await TournamentService.registerRebuy({
    tournamentPlayerId: req.params.tournamentPlayerId,
    registeredByUserId: req.user!.userId,
  })
  res.json(result)
})

// POST /tournaments/players/:tournamentPlayerId/addon
router.post('/players/:tournamentPlayerId/addon', async (req: AuthRequest, res: Response) => {
  const result = await TournamentService.registerAddon({
    tournamentPlayerId: req.params.tournamentPlayerId,
    registeredByUserId: req.user!.userId,
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
    position: data.position,
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
