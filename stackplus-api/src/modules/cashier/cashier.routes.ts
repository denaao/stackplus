import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import * as CashierService from './cashier.service'
import * as SangeurService from '../sangeur/sangeur.service'
import { z } from 'zod'
import { emitSessionRankingUpdated, getIO, getPrivateSessionRoom } from '../../socket/socket'

const router = Router()

const txSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.enum(['BUYIN', 'REBUY', 'ADDON', 'CASHOUT', 'JACKPOT']),
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
    io.to(getPrivateSessionRoom(data.sessionId)).emit('transaction:new', result)

    const { getRanking } = await import('../ranking/ranking.service')
    const ranking = await getRanking(data.sessionId)
    emitSessionRankingUpdated(data.sessionId, ranking)
  } catch (error) {
    req.log?.warn({ err: error }, '[cashier] realtime broadcast failed')
  }

  res.status(201).json(result)
})

router.get('/transactions', authenticate, async (req: AuthRequest, res: Response) => {
  const { sessionId, userId } = req.query as { sessionId: string; userId?: string }
  const transactions = await CashierService.getTransactions(sessionId, userId)
  res.json(transactions)
})

router.get('/sessions/:sessionId/sangeur-sales', authenticate, async (req: AuthRequest, res: Response) => {
  const sales = await SangeurService.listSessionSales(req.params.sessionId)
  res.json(sales)
})

router.delete('/transaction/:transactionId', authenticate, async (req: AuthRequest, res: Response) => {
  const result = await CashierService.deleteTransaction(req.params.transactionId)

  // SEC-008: audit trail pra delete de transação (operação financeira reversa).
  const { logAudit } = await import('../../lib/audit')
  await logAudit({
    userId: req.user?.userId,
    action: 'TRANSACTION_DELETE',
    resource: 'Transaction',
    resourceId: req.params.transactionId,
    metadata: { sessionId: result.sessionId },
    ip: req.ip,
    userAgent: String(req.headers['user-agent'] || ''),
  })

  try {
    const io = getIO()
    io.to(getPrivateSessionRoom(result.sessionId)).emit('transaction:deleted', { transactionId: req.params.transactionId })

    const { getRanking } = await import('../ranking/ranking.service')
    const ranking = await getRanking(result.sessionId)
    emitSessionRankingUpdated(result.sessionId, ranking)
  } catch (error) {
    req.log?.warn({ err: error }, '[cashier] realtime broadcast failed after delete')
  }

  res.json(result)
})

export default router
