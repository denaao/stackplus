import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import * as CashierService from './cashier.service'
import { z } from 'zod'
import { getIO } from '../../socket/socket'
import { TransactionType } from '@prisma/client'

const router = Router()

const txSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.nativeEnum(TransactionType),
  amount: z.number().min(0),
  chips: z.number().min(0),
  note: z.string().optional(),
})

router.post('/transaction', authenticate, async (req: AuthRequest, res: Response) => {
  const data = txSchema.parse(req.body)
  const result = await CashierService.registerTransaction({
    ...data,
    registeredBy: req.user!.userId,
  })

  // Realtime updates are best-effort in development to avoid breaking transaction flow.
  try {
    const io = getIO()
    io.to(`session:${data.sessionId}`).emit('transaction:new', result)

    const { getRanking } = await import('../ranking/ranking.service')
    const ranking = await getRanking(data.sessionId)
    io.to(`session:${data.sessionId}`).emit('ranking:updated', ranking)
  } catch (error) {
    console.warn('[cashier] realtime broadcast failed:', error)
  }

  res.status(201).json(result)
})

router.get('/transactions', authenticate, async (req: AuthRequest, res: Response) => {
  const { sessionId, userId } = req.query as { sessionId: string; userId?: string }
  const transactions = await CashierService.getTransactions(sessionId, userId)
  res.json(transactions)
})

export default router
