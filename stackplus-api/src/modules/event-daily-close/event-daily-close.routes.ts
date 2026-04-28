import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import * as DailyCloseService from './event-daily-close.service'
import { z } from 'zod'

const router = Router({ mergeParams: true })

const closeSchema = z.object({
  notes: z.string().max(2000).optional(),
})

const getOrCreateSchema = z.object({
  date: z.coerce.date(),
})

// Listar todos os fechamentos do evento
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { eventId } = req.params
  const closes = await DailyCloseService.listDailyCloses(eventId, req.user!.userId)
  res.json(closes)
})

// Buscar ou criar fechamento para uma data especifica
// POST /events/:eventId/daily-closes/open  { date: "2026-04-26" }
router.post('/open', authenticate, async (req: AuthRequest, res: Response) => {
  const { eventId } = req.params
  const { date } = getOrCreateSchema.parse(req.body)
  const close = await DailyCloseService.getOrCreateDailyClose(eventId, date, req.user!.userId)
  res.status(200).json(close)
})

// Resumo ao vivo de um dia (sem criar registro)
// GET /events/:eventId/daily-closes/summary?date=2026-04-26
router.get('/summary', authenticate, async (req: AuthRequest, res: Response) => {
  const { eventId } = req.params
  const { date } = getOrCreateSchema.parse({ date: req.query.date })
  const summary = await DailyCloseService.getDailySummary(eventId, date, req.user!.userId)
  res.json(summary)
})

// Buscar fechamento especifico
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const { eventId, id } = req.params
  const close = await DailyCloseService.getDailyClose(eventId, id, req.user!.userId)
  res.json(close)
})

// Fechar o dia (snapshot imutavel)
router.patch('/:id/close', authenticate, async (req: AuthRequest, res: Response) => {
  const { eventId, id } = req.params
  const { notes } = closeSchema.parse(req.body)
  const close = await DailyCloseService.closeDailyClose(eventId, id, req.user!.userId, notes)
  res.json(close)
})

// Reabrir fechamento (apenas host)
router.patch('/:id/reopen', authenticate, async (req: AuthRequest, res: Response) => {
  const { eventId, id } = req.params
  const close = await DailyCloseService.reopenDailyClose(eventId, id, req.user!.userId)
  res.json(close)
})

export default router
