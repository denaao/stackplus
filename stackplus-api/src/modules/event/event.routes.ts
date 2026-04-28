import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import * as EventService from './event.service'
import * as EventSangeurService from './event-sangeur.service'
import * as SessionService from '../session/session.service'
import * as TournamentService from '../tournament/tournament.service'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

const router = Router()

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createEventSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  venue: z.string().max(200).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  registrationOpenAt: z.coerce.date().optional(),
  registrationCloseAt: z.coerce.date().optional(),
  isPublic: z.boolean().optional(),
  financialModule: z.enum(['POSTPAID', 'PREPAID', 'HYBRID']).optional(),
  chipValue: z.number().positive(),
})

const updateEventSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).optional(),
  venue: z.string().max(200).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  registrationOpenAt: z.coerce.date().optional(),
  registrationCloseAt: z.coerce.date().optional(),
  isPublic: z.boolean().optional(),
  chipValue: z.number().positive().optional(),
})

const listPublicSchema = z.object({
  status: z.enum(['DRAFT', 'OPEN', 'IN_PROGRESS', 'FINISHED', 'CANCELED']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

const createSessionSchema = z.object({
  name: z.string().max(100).optional(),
  gameType: z.enum(['CASH_GAME', 'TOURNAMENT']).optional(),
  financialModule: z.enum(['POSTPAID', 'PREPAID', 'HYBRID']).optional(),
  chipValue: z.number().positive().optional(),
  smallBlind: z.number().positive().optional(),
  bigBlind: z.number().positive().optional(),
  minimumBuyIn: z.number().positive().optional(),
  minimumStayMinutes: z.number().int().positive().optional(),
  foodFee: z.number().min(0).optional(),
  jackpotEnabled: z.boolean().optional(),
  pokerVariant: z.enum(['HOLDEN', 'BUTTON_CHOICE', 'PINEAPPLE', 'OMAHA', 'OMAHA_FIVE', 'OMAHA_SIX']).optional(),
})

const createTournamentSchema = z.object({
  name: z.string().min(2).max(120),
  buyInAmount: z.number().positive(),
  rebuyAmount: z.number().positive().optional(),
  addonAmount: z.number().positive().optional(),
  bountyAmount: z.number().positive().optional(),
  rake: z.number().min(0).max(100).optional(),
  startingChips: z.number().int().positive(),
  rebuyChips: z.number().int().positive().optional(),
  addonChips: z.number().int().positive().optional(),
  buyInTaxAmount: z.number().positive().optional().nullable(),
  buyInTaxChips: z.number().int().min(0).optional().nullable(),
  rebuyTaxAmount: z.number().positive().optional().nullable(),
  rebuyTaxChips: z.number().int().min(0).optional().nullable(),
  addonTaxAmount: z.number().positive().optional().nullable(),
  addonTaxChips: z.number().int().min(0).optional().nullable(),
  lateRegistrationLevel: z.number().int().positive().optional(),
  rebuyUntilLevel: z.number().int().positive().optional(),
  addonAfterLevel: z.number().int().positive().optional(),
  minutesPerLevelPreLateReg: z.number().int().positive(),
  minutesPerLevelPostLateReg: z.number().int().positive().optional(),
  breaks: z.array(z.object({ afterLevel: z.number().int(), durationMinutes: z.number().int() })).optional(),
  blindTemplateName: z.string().optional(),
  blindLevels: z.array(z.object({
    level: z.number().int().positive(),
    smallBlind: z.number().int().positive(),
    bigBlind: z.number().int().positive(),
    ante: z.number().int().nonnegative().default(0),
  })).optional(),
  doubleBuyInBonusChips: z.number().int().positive().optional(),
  doubleRebuyEnabled: z.boolean().optional(),
  doubleRebuyBonusChips: z.number().int().positive().optional().nullable(),
  staffRetentionPct: z.number().min(0).max(100).optional().nullable(),
  staffRetentionDest: z.enum(['STAFF', 'ADM']).optional().nullable(),
  rankingRetentionPct: z.number().min(0).max(100).optional().nullable(),
  timeChipBonus: z.number().int().positive().optional().nullable(),
  timeChipUntilLevel: z.number().int().positive().optional().nullable(),
})

// ─── Routes ───────────────────────────────────────────────────────────────────

// Criar evento
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const data = createEventSchema.parse(req.body)
  const event = await EventService.createEvent(req.user!.userId, data)
  res.status(201).json(event)
})

// Listar eventos publicos (discovery)
router.get('/public', authenticate, async (req: AuthRequest, res: Response) => {
  const filters = listPublicSchema.parse(req.query)
  const events = await EventService.listPublicEvents(filters)
  res.json(events)
})

// Meus eventos (host + staff)
router.get('/mine', authenticate, async (req: AuthRequest, res: Response) => {
  const result = await EventService.listMyEvents(req.user!.userId)
  res.json(result)
})

// Buscar evento por codigo de acesso
router.get('/access/:code', authenticate, async (req: AuthRequest, res: Response) => {
  const event = await EventService.getEventByAccessCode(req.params.code)
  res.json(event)
})

// Buscar evento por id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const event = await EventService.getEventByIdForUser(req.params.id, req.user!.userId)
  res.json(event)
})

// Atualizar evento
router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const data = updateEventSchema.parse(req.body)
  const event = await EventService.updateEvent(req.params.id, req.user!.userId, data)
  res.json(event)
})

// Transicoes de status
router.patch('/:id/open', authenticate, async (req: AuthRequest, res: Response) => {
  const event = await EventService.openEvent(req.params.id, req.user!.userId)
  res.json(event)
})

router.patch('/:id/start', authenticate, async (req: AuthRequest, res: Response) => {
  const event = await EventService.startEvent(req.params.id, req.user!.userId)
  res.json(event)
})

router.patch('/:id/finish', authenticate, async (req: AuthRequest, res: Response) => {
  const event = await EventService.finishEvent(req.params.id, req.user!.userId)
  res.json(event)
})

router.patch('/:id/cancel', authenticate, async (req: AuthRequest, res: Response) => {
  const event = await EventService.cancelEvent(req.params.id, req.user!.userId)
  res.json(event)
})

// Rotacionar codigo de acesso (apenas host)
router.post('/:id/rotate-access-code', authenticate, async (req: AuthRequest, res: Response) => {
  const result = await EventService.rotateAccessCode(req.params.id, req.user!.userId)
  res.json(result)
})

// ─── Sangeur do evento ────────────────────────────────────────────────────────

const enableSangeurSchema = z.object({
  cpf: z.string().min(11).max(14),
  username: z.string().trim().min(3).max(40).optional(),
})

router.get('/:id/sangeurs', authenticate, async (req: AuthRequest, res: Response) => {
  const accesses = await EventSangeurService.listEventSangeurAccesses(req.params.id, req.user!.userId)
  res.json(accesses)
})

router.post('/:id/sangeurs', authenticate, async (req: AuthRequest, res: Response) => {
  const data = enableSangeurSchema.parse(req.body)
  const cpfDigits = data.cpf.replace(/\D/g, '')
  const user = await prisma.user.findFirst({ where: { cpf: cpfDigits }, select: { id: true } })
  if (!user) throw Object.assign(new Error('Usuário com este CPF não encontrado.'), { statusCode: 404 })
  const result = await EventSangeurService.enableEventSangeurAccess({
    eventId: req.params.id,
    hostId: req.user!.userId,
    memberUserId: user.id,
    username: data.username,
  })
  res.status(201).json(result)
})

router.get('/:id/sangeurs/:userId/login-qr', authenticate, async (req: AuthRequest, res: Response) => {
  const result = await EventSangeurService.getLoginQr(req.params.id, req.user!.userId, req.params.userId)
  res.json(result)
})

router.patch('/:id/sangeurs/:userId/enable', authenticate, async (req: AuthRequest, res: Response) => {
  const access = await EventSangeurService.enableExistingEventSangeurAccess(req.params.id, req.user!.userId, req.params.userId)
  res.json(access)
})

router.patch('/:id/sangeurs/:userId/disable', authenticate, async (req: AuthRequest, res: Response) => {
  const access = await EventSangeurService.disableEventSangeurAccess(req.params.id, req.user!.userId, req.params.userId)
  res.json(access)
})

router.patch('/:id/sangeurs/:userId/reset-password', authenticate, async (req: AuthRequest, res: Response) => {
  const result = await EventSangeurService.resetEventSangeurPassword({
    eventId: req.params.id,
    hostId: req.user!.userId,
    memberUserId: req.params.userId,
  })
  res.json(result)
})

// ─── Sessions do evento ───────────────────────────────────────────────────────

router.get('/:id/sessions', authenticate, async (req: AuthRequest, res: Response) => {
  const sessions = await SessionService.getSessionsByEventForUser(req.params.id, req.user!.userId)
  res.json(sessions)
})

router.post('/:id/sessions', authenticate, async (req: AuthRequest, res: Response) => {
  const data = createSessionSchema.parse(req.body)
  const session = await SessionService.createEventSession(req.params.id, req.user!.userId, data)
  res.status(201).json(session)
})

// ─── Torneios do evento ───────────────────────────────────────────────────────

router.get('/:id/tournaments', authenticate, async (req: AuthRequest, res: Response) => {
  const status = req.que