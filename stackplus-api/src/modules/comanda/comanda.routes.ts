import { Router, Response } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import * as ComandaService from './comanda.service'

const router = Router()
router.use(authenticate)

// POST /comanda/open
router.post('/open', async (req: AuthRequest, res: Response) => {
  const data = z.object({
    playerId: z.string().uuid(),
    homeGameId: z.string().uuid(),
    mode: z.enum(['PREPAID', 'POSTPAID']).optional(),
    creditLimit: z.number().positive().optional().nullable(),
    note: z.string().trim().max(300).optional(),
  }).parse(req.body)

  const comanda = await ComandaService.openComanda({
    ...data,
    openedByUserId: req.user!.userId,
  })
  res.status(201).json(comanda)
})

// GET /comanda/:comandaId
router.get('/:comandaId', async (req: AuthRequest, res: Response) => {
  const comanda = await ComandaService.getComanda(req.params.comandaId, req.user!.userId)
  res.json(comanda)
})

// GET /comanda/player/:playerId?homeGameId=...
router.get('/player/:playerId', async (req: AuthRequest, res: Response) => {
  const homeGameId = z.string().uuid().parse(req.query.homeGameId)
  const comanda = await ComandaService.getComandaByPlayer({
    playerId: req.params.playerId,
    homeGameId,
    viewerUserId: req.user!.userId,
  })
  res.json(comanda)
})

// GET /comanda?homeGameId=...&status=OPEN|CLOSED
router.get('/', async (req: AuthRequest, res: Response) => {
  const homeGameId = z.string().uuid().parse(req.query.homeGameId)
  const status = z.enum(['OPEN', 'CLOSED']).optional().parse(req.query.status)
  const comandas = await ComandaService.listComandas({
    homeGameId,
    status,
    viewerUserId: req.user!.userId,
  })
  res.json(comandas)
})

// POST /comanda/:comandaId/items
router.post('/:comandaId/items', async (req: AuthRequest, res: Response) => {
  const data = z.object({
    type: z.enum([
      'CASH_BUYIN', 'CASH_REBUY', 'CASH_ADDON', 'CASH_CASHOUT',
      'TOURNAMENT_BUYIN', 'TOURNAMENT_REBUY', 'TOURNAMENT_ADDON',
      'TOURNAMENT_BOUNTY_RECEIVED', 'TOURNAMENT_PRIZE',
      'PAYMENT_PIX_SPOT', 'PAYMENT_PIX_TERM', 'PAYMENT_CASH', 'PAYMENT_CARD',
      'TRANSFER_IN', 'TRANSFER_OUT',
    ]),
    amount: z.number().positive(),
    description: z.string().trim().max(300).optional(),
    sessionId: z.string().uuid().optional(),
    tournamentId: z.string().uuid().optional(),
    tournamentPlayerId: z.string().uuid().optional(),
    transactionId: z.string().uuid().optional(),
  }).parse(req.body)

  const item = await ComandaService.addComandaItem({
    comandaId: req.params.comandaId,
    ...data,
    createdByUserId: req.user!.userId,
  })
  res.status(201).json(item)
})

// PATCH /comanda/items/:itemId/settle
router.patch('/items/:itemId/settle', async (req: AuthRequest, res: Response) => {
  const data = z.object({
    paymentReference: z.string().optional(),
    paymentVirtualAccount: z.string().optional(),
    paymentStatus: z.enum(['PENDING', 'PAID', 'EXPIRED', 'CANCELED']),
  }).parse(req.body)

  const item = await ComandaService.settleComandaPaymentItem({
    itemId: req.params.itemId,
    ...data,
    viewerUserId: req.user!.userId,
  })
  res.json(item)
})

// GET /comanda/items/:itemId/pix-status
// Consulta o banco pra ver se a cobrança PIX foi paga, e liquida automaticamente se sim.
router.get('/items/:itemId/pix-status', async (req: AuthRequest, res: Response) => {
  const result = await ComandaService.checkComandaItemPixStatus(req.params.itemId, req.user!.userId)
  res.json(result)
})

// POST /comanda/:comandaId/pix-out
// Envia PIX real via Annapay ao jogador usando a chave PIX dele, e registra TRANSFER_OUT.
router.post('/:comandaId/pix-out', async (req: AuthRequest, res: Response) => {
  const data = z.object({
    amount: z.number().positive(),
  }).parse(req.body)

  const result = await ComandaService.sendComandaPixOut({
    comandaId: req.params.comandaId,
    amount: data.amount,
    createdByUserId: req.user!.userId,
  })
  res.status(201).json(result)
})

// POST /comanda/:comandaId/pix-charge
// Gera cobrança PIX (QR ou 24h) via Annapay e registra item PENDING na comanda.
router.post('/:comandaId/pix-charge', async (req: AuthRequest, res: Response) => {
  const data = z.object({
    amount: z.number().positive(),
    kind: z.enum(['SPOT', 'TERM']),
  }).parse(req.body)

  const result = await ComandaService.generateComandaPixCharge({
    comandaId: req.params.comandaId,
    amount: data.amount,
    kind: data.kind,
    createdByUserId: req.user!.userId,
  })
  res.status(201).json(result)
})

// GET /comanda/bank?homeGameId=...
// Saldo bancário e últimas movimentações do home game.
router.get('/bank', async (req: AuthRequest, res: Response) => {
  const homeGameId = z.string().uuid().parse(req.query.homeGameId)
  const result = await ComandaService.getHomeGameBank(homeGameId, req.user!.userId)
  res.json(result)
})

// POST /comanda/bank/reconcile
// Varre items PAID sem bank tx correspondente e cria lançamentos retroativos.
router.post('/bank/reconcile', async (req: AuthRequest, res: Response) => {
  const { homeGameId } = z.object({ homeGameId: z.string().uuid() }).parse(req.body)
  const result = await ComandaService.reconcileHomeGameBank(homeGameId, req.user!.userId)
  res.json(result)
})

// POST /comanda/cashbox/close?homeGameId=...
// Gera relatório agregado de caixa do home game.
router.post('/cashbox/close', async (req: AuthRequest, res: Response) => {
  const data = z.object({
    homeGameId: z.string().uuid(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }).parse(req.body)

  const result = await ComandaService.closeCashbox({
    homeGameId: data.homeGameId,
    viewerUserId: req.user!.userId,
    from: data.from ? new Date(data.from) : undefined,
    to: data.to ? new Date(data.to) : undefined,
  })
  res.json(result)
})

// POST /comanda/:comandaId/close
router.post('/:comandaId/close', async (req: AuthRequest, res: Response) => {
  const comanda = await ComandaService.closeComanda({
    comandaId: req.params.comandaId,
    closedByUserId: req.user!.userId,
  })
  res.json(comanda)
})

export default router
