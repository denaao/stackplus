import { Router, Response } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import * as SangeurService from './sangeur.service'

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
    console.error('[sangeur webhook] Error processing PIX payment:', error)
    return res.status(200).json({ received: true, error: 'Processing failed' })
  }
})

router.use(authenticate)

router.get('/home-games/:homeGameId/sessions', async (req: AuthRequest, res: Response) => {
  const sessions = await SangeurService.listOperationalSessions(req.params.homeGameId, req.user!.userId)
  res.json(sessions)
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
    playerName: z.string().trim().max(120).optional(),
    note: z.string().trim().max(300).optional(),
    paymentReference: z.string().trim().max(200).optional(),
  }).parse(req.body)

  const result = await SangeurService.registerSale({
    shiftId: req.params.shiftId,
    userId: req.user!.userId,
    chips: data.chips,
    paymentMethod: data.paymentMethod,
    playerName: data.playerName,
    note: data.note,
    paymentReference: data.paymentReference,
  })

  res.status(201).json(result)
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

export default router
