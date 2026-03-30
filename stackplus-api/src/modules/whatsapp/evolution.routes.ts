import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize, AuthRequest } from '../../middlewares/auth.middleware'
import * as EvolutionController from './evolution.controller'

const router = Router()

router.post('/setup', authenticate, authorize('ADMIN', 'HOST'), async (req, res) => {
  req.body = z.object({
    phoneNumber: z.string().trim().optional(),
  }).parse(req.body)

  return EvolutionController.setupInstance(req, res)
})

router.get('/connect', authenticate, authorize('ADMIN', 'HOST'), EvolutionController.connectInstance)
router.get('/status', authenticate, authorize('ADMIN', 'HOST'), EvolutionController.instanceStatus)

router.post('/send-test', authenticate, authorize('ADMIN', 'HOST'), async (req, res) => {
  req.body = z.object({
    phone: z.string().trim().min(10),
    text: z.string().trim().min(1).max(2000),
  }).parse(req.body)

  return EvolutionController.sendTestMessage(req, res)
})

router.get('/logs', authenticate, authorize('ADMIN', 'HOST'), EvolutionController.listLogs)
router.post('/webhook', EvolutionController.receiveWebhook)
router.post('/sessions/:sessionId/notify-results', authenticate, async (req: AuthRequest, res) => EvolutionController.notifySessionResults(req, res))

export default router