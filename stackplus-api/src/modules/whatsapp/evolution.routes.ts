import { Router } from 'express'
import { z } from 'zod'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import * as EvolutionController from './evolution.controller'

const router = Router()

// A instancia do WhatsApp eh por USUARIO (cada user tem sua). Nao limitamos por role
// global porque o cadastro publico cria todo mundo como PLAYER — quem realmente pode
// usar eh quem eh dono de algum home game, e isso ja eh filtrado no frontend (botao
// so aparece nos cards OWNER). Deixar a rota aberta a qualquer user autenticado.

router.post('/setup', authenticate, async (req, res) => {
  req.body = z.object({
    phoneNumber: z.string().trim().optional(),
  }).parse(req.body)

  return EvolutionController.setupInstance(req, res)
})

router.get('/connect', authenticate, EvolutionController.connectInstance)
router.get('/status', authenticate, EvolutionController.instanceStatus)
router.post('/reset', authenticate, EvolutionController.resetInstance)

router.post('/send-test', authenticate, async (req, res) => {
  req.body = z.object({
    phone: z.string().trim().min(10),
    text: z.string().trim().min(1).max(2000),
  }).parse(req.body)

  return EvolutionController.sendTestMessage(req, res)
})

router.get('/logs', authenticate, EvolutionController.listLogs)
router.post('/webhook', EvolutionController.receiveWebhook)
router.post('/sessions/:sessionId/notify-results', authenticate, async (req: AuthRequest, res) => EvolutionController.notifySessionResults(req, res))

export default router