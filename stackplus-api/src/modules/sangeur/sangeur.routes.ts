import { Router, Response } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import * as SangeurService from './sangeur.service'
import { emitSessionRankingUpdated, getIO, getPrivateSessionRoom } from '../../socket/socket'
import { prisma } from '../../lib/prisma'
import * as AnnapayService from '../banking/annapay.service'

const router = Router()

// Webhook para notificações PIX (sem autenticação)
router.post('/webhooks/pix', async (req, res: Response) => {
  const configuredSecret = process.env.SANGEUR_WEBHOOK_SECRET?.trim()
  if (configuredSecret) {
    const providedSecret = String(req.headers['x-sangeur-webhook-secret'] || req.headers['x-webhook-secret'] || '').trim()
    if (!providedSecret || providedSecret !== configuredSecret) {
      return res.status(200).json({ received: true, ignored: 'missing-or-invalid-webhook-secret' })
    }
  }

  try {
    const result = await SangeurService.settleSangeurPixSaleFromWebhook(req.body)
    return res.status(200).json(result)
  } catch (error) {
    req.log?.error({ err: error }, '[sangeur webhook] error processing PIX payment')
    return res.status(200).json({ received: true, error: 'Processing failed' })
  }
})

router.use(authenticate)

router.get('/home-games/:homeGameId/sessions', async (req: AuthRequest, res: Response) => {
  const sessions = await SangeurService.listOperationalSessions(req.params.homeGameId, req.user!.userId)
  res.json(sessions)
})

router.get('/sessions/:sessionId/participants', async (req: AuthRequest, res: Response) => {
  const data = await SangeurService.listSessionParticipants({
    sessionId: req.params.sessionId,
    userId: req.user!.userId,
  })
  res.json(data)
})

router.post('/shifts/open', async (req: AuthRequest, res: Response) => {
  const data = z.object({
    homeGameId: z.string().uuid(),
    sessionId: z.string().uuid(),
    initialChips: z.number().nonnegative(),
    note: z.string().trim().max(300).optional(),
  }).parse(req.body)

  const shift = await SangeurService.openShift({
    homeGameId: data.homeGameId,
    sessionId: data.sessionId,
    userId: req.user!.userId,
    initialChips: data.initialChips,
    note: data.note,
  })

  res.status(201).json(shift)
})

router.get('/shifts/:shiftId', async (req: AuthRequest, res: Response) => {
  const shift = await SangeurService.getShift(req.params.shiftId, req.user!.userId)
  res.json(shift)
})

router.get('/shifts/:shiftId/closing-report', async (req: AuthRequest, res: Response) => {
  const report = await SangeurService.getShiftClosingReport({
    shiftId: req.params.shiftId,
    userId: req.user!.userId,
  })

  res.json(report)
})

router.post('/shifts/:shiftId/reload', async (req: AuthRequest, res: Response) => {
  const data = z.object({
    chips: z.number().positive(),
    note: z.string().trim().max(300).optional(),
  }).parse(req.body)

  const shift = await SangeurService.addReload({
    shiftId: req.params.shiftId,
    userId: req.user!.userId,
    chips: data.chips,
    note: data.note,
  })

  res.json(shift)
})

router.post('/shifts/:shiftId/sales', async (req: AuthRequest, res: Response) => {
  const data = z.object({
    chips: z.number().positive(),
    paymentMethod: z.enum(['PIX_QR', 'VOUCHER', 'CASH', 'CARD']),
    sessionUserId: z.string().uuid(),
    playerName: z.string().trim().max(120).optional(),
    note: z.string().trim().max(300).optional(),
    paymentReference: z.string().trim().max(200).optional(),
    signatureData: z.string().max(500000).optional(),
  }).parse(req.body)

  const result = await SangeurService.registerSale({
    shiftId: req.params.shiftId,
    userId: req.user!.userId,
    chips: data.chips,
    paymentMethod: data.paymentMethod,
    sessionUserId: data.sessionUserId,
    playerName: data.playerName,
    note: data.note,
    paymentReference: data.paymentReference,
    signatureData: data.signatureData,
  })

  // Realtime broadcast: reusa o canal do caixa (transaction:new) para atualizar
  // totais/jogador na tela do caixa de graça, e emite sangeur:sale no mesmo room
  // para o painel lateral específico do sangeur.
  try {
    const io = getIO()
    const sessionId = result.shift.session!.id
    const room = getPrivateSessionRoom(sessionId)
    const socketsInRoom = await io.in(room).fetchSockets()
    req.log?.debug({ room, clients: socketsInRoom.length }, '[sangeur] emitting transaction:new')
    io.to(room).emit('transaction:new', {
      transaction: result.transaction,
      playerState: result.playerState,
    })

    const { getRanking } = await import('../ranking/ranking.service')
    const ranking = await getRanking(sessionId)
    emitSessionRankingUpdated(sessionId, ranking)
  } catch (error) {
    req.log?.warn({ err: error }, '[sangeur] realtime broadcast failed')
  }

  res.status(201).json(result)
})

router.post('/sales/:saleId/settle-pix', async (req: AuthRequest, res: Response) => {
  const { manual } = z.object({ manual: z.boolean().optional() }).parse(req.body)

  const sale = await prisma.sangeurSale.findUniqueOrThrow({
    where: { id: req.params.saleId },
    include: { shift: { select: { sangeurUserId: true } } },
  })

  if (sale.shift.sangeurUserId !== req.user!.userId) throw new Error('Acesso negado')
  if (sale.paymentStatus === 'PAID') return res.json({ settled: true, message: 'Já confirmado' })
  if (sale.paymentMethod !== 'PIX_QR') throw new Error('Apenas vendas PIX')

  // Confirmação manual pelo operador (botão "Confirmar pagamento")
  if (manual) {
    const updated = await prisma.sangeurSale.update({
      where: { id: sale.id },
      data: { paymentStatus: 'PAID', settledAt: new Date() },
    })
    return res.json({ settled: true, message: 'Pagamento confirmado manualmente', sale: updated })
  }

  // Verificação automática — usa mesma lógica robusta do caixa
  if (!sale.paymentReference) {
    return res.json({ settled: false, message: 'Cobrança sem referência' })
  }

  const { paid } = await AnnapayService.checkPixChargeIsPaid(sale.paymentReference)

  if (paid) {
    const updated = await prisma.sangeurSale.update({
      where: { id: sale.id },
      data: { paymentStatus: 'PAID', settledAt: new Date() },
    })
    return res.json({ settled: true, message: 'Pagamento confirmado', sale: updated })
  }

  return res.json({ settled: false, message: 'Aguardando pagamento...' })
})

router.patch('/sales/:saleId/settle', async (req: AuthRequest, res: Response) => {
  const data = z.object({
    paymentReference: z.string().trim().max(200).optional(),
  }).parse(req.body)

  const sale = await SangeurService.settleVoucherSale({
    saleId: req.params.saleId,
    userId: req.user!.userId,
    paymentReference: data.paymentReference,
  })

  res.json(sale)
})

router.get('/sales/:saleId/voucher-receipt', async (req: AuthRequest, res: Response) => {
  const data = await SangeurService.getVoucherReceiptData({
    saleId: req.params.saleId,
    userId: req.user!.userId,
  })

  res.json(data)
})

router.post('/shifts/:shiftId/close', async (req: AuthRequest, res: Response) => {
  const data = z.object({
    returnedChips: z.number().nonnegative(),
    note: z.string().trim().max(300).optional(),
  }).parse(req.body)

  const shift = await SangeurService.closeShift({
    shiftId: req.params.shiftId,
    userId: req.user!.userId,
    returnedChips: data.returnedChips,
    note: data.note,
  })

  res.json(shift)
})

// ── Tournament 