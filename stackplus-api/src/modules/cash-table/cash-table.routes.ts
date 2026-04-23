import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import { z } from 'zod'
import * as CashTableService from './cash-table.service'

const router = Router()

// ─── Mesa ─────────────────────────────────────────────────────────────────────

// Listar mesas de uma sessão
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { sessionId } = z.object({ sessionId: z.string().uuid() }).parse(req.query)
  const tables = await CashTableService.getSessionTables(sessionId)
  res.json(tables)
})

// Abrir nova mesa
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { sessionId, name, caixinhaMode } = z.object({
    sessionId: z.string().uuid(),
    name: z.string().min(1).max(50).default('Mesa 1'),
    caixinhaMode: z.enum(['SPLIT', 'INDIVIDUAL']).default('SPLIT'),
  }).parse(req.body)

  const table = await CashTableService.createTable(sessionId, name, caixinhaMode)
  res.status(201).json(table)
})

// Detalhes de uma mesa
router.get('/:tableId', authenticate, async (req: AuthRequest, res: Response) => {
  const table = await CashTableService.getTable(req.params.tableId)
  res.json(table)
})

// Atualizar rake e/ou caixinha manualmente
router.patch('/:tableId/rake', authenticate, async (req: AuthRequest, res: Response) => {
  const { rake, caixinha } = z.object({
    rake: z.number().nonnegative(),
    caixinha: z.number().nonnegative().optional(),
  }).parse(req.body)

  const table = await CashTableService.updateTableRake(req.params.tableId, rake, caixinha)
  res.json(table)
})

// ─── Seats ────────────────────────────────────────────────────────────────────

// Sentar jogador na mesa
router.post('/:tableId/seats', authenticate, async (req: AuthRequest, res: Response) => {
  const { userId } = z.object({ userId: z.string().uuid() }).parse(req.body)
  const seat = await CashTableService.addSeat(req.params.tableId, userId)
  res.status(201).json(seat)
})

// ─── Sangria ──────────────────────────────────────────────────────────────────

// Listar sangrias de uma mesa
router.get('/:tableId/sangrias', authenticate, async (req: AuthRequest, res: Response) => {
  const sangrias = await CashTableService.getSangrias(req.params.tableId)
  res.json(sangrias)
})

// Registrar sangria (parcial ou final)
router.post('/:tableId/sangria', authenticate, async (req: AuthRequest, res: Response) => {
  const { rake, caixinha, isFinal, note } = z.object({
    rake: z.number().nonnegative().default(0),
    caixinha: z.number().nonnegative().default(0),
    isFinal: z.boolean().default(false),
    note: z.string().optional(),
  }).parse(req.body)

  const sangria = await CashTableService.createSangria(
    req.params.tableId,
    rake,
    caixinha,
    isFinal,
    note,
    req.user!.userId,
  )
  res.status(201).json(sangria)
})

export default router
