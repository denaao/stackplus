import { Router } from 'express'
import { z } from 'zod'
import { authenticate, authorize } from '../../middlewares/auth.middleware'
import { webhookLimiter, settleLimiter } from '../../middlewares/rate-limit.middleware'
import * as AnnapayController from './annapay.controller'

const router = Router()

function isIsoDateTime(value: string) {
  return value.includes('T') && !Number.isNaN(Date.parse(value))
}

const statementsSchema = z.object({
  Inicio: z.string().trim().refine(isIsoDateTime, { message: 'Inicio deve estar em formato ISO 8601' }),
  Fim: z.string().trim().refine(isIsoDateTime, { message: 'Fim deve estar em formato ISO 8601' }),
  Tipo: z.string().trim().optional(),
  'Paginacao.ItensPorPagina': z.coerce.number().int().positive().max(200).optional(),
  'Paginacao.paginaAtual': z.coerce.number().int().min(0).optional(),
})

const cobSchema = z.object({
  calendario: z.object({
    expiracao: z.number().int().positive(),
  }),
  devedor: z.object({
    cpf: z.string().trim().regex(/^\d{11}$/).nullable().optional(),
    cnpj: z.string().trim().regex(/^\d{14}$/).nullable().optional(),
    nome: z.string().trim().min(3).max(120),
  }).refine((value) => Boolean(value.cpf || value.cnpj), {
    message: 'Informe cpf ou cnpj do devedor',
  }),
  valor: z.object({
    original: z.string().trim().regex(/^\d+(\.\d{2})$/, { message: 'valor.original deve ter 2 casas decimais, ex: 10.00' }),
  }),
  solicitacaoPagador: z.string().trim().max(140).optional(),
})

const pixSchema = z.object({
  valor: z.number().positive(),
  descricao: z.string().trim().max(140).optional(),
  destinatario: z.object({
    tipo: z.literal('CHAVE'),
    chave: z.string().trim().min(3),
    cpfCnpjRecebedor: z.string().trim().regex(/^(\d{11}|\d{14})$/),
  }),
})

router.post('/webhooks/cob', webhookLimiter, async (req, _res, next) => {
  req.body = z.record(z.string(), z.unknown()).or(z.array(z.unknown())).parse(req.body)
  return next()
}, AnnapayController.handleCobWebhook)

router.use(authenticate, authorize('ADMIN', 'HOST'))

router.post('/login', AnnapayController.login)
router.get('/accounts', AnnapayController.listAccounts)
router.get('/webhook', async (req, _res, next) => {
  z.object({
    virtualAccount: z.string().trim().optional(),
  }).parse(req.query)

  return next()
}, AnnapayController.listWebhooks)
router.post('/webhook/sync', async (req, _res, next) => {
  z.object({
    virtualAccount: z.string().trim().optional(),
  }).parse(req.query)

  return next()
}, AnnapayController.syncCobWebhook)

router.get('/balance', async (req, _res, next) => {
  z.object({
    virtualAccount: z.string().trim().optional(),
  }).parse(req.query)

  return next()
}, AnnapayController.getBalance)

router.get('/statements', async (req, _res, next) => {
  statementsSchema.parse(req.query)
  return next()
}, AnnapayController.getStatements)

router.post('/cob', async (req, _res, next) => {
  req.body = cobSchema.parse(req.body)
  z.object({
    virtualAccount: z.string().trim().optional(),
  }).parse(req.query)

  return next()
}, AnnapayController.createCob)

router.get('/cob/:id', async (req, _res, next) => {
  req.params = z.object({
    id: z.string().trim().min(1),
  }).parse(req.params)
  z.object({
    virtualAccount: z.string().trim().optional(),
  }).parse(req.query)

  return next()
}, AnnapayController.getCobById)

router.post('/pix', async (req, _res, next) => {
  req.body = pixSchema.parse(req.body)
  return next()
}, AnnapayController.createPix)

router.put('/pix/:id', async (req, _res, next) => {
  req.params = z.object({
    id: z.string().trim().min(1),
  }).parse(req.params)

  return next()
}, AnnapayController.confirmPix)

router.post('/sessions/:sessionId/financial-report', async (req, _res, next) => {
  req.params = z.object({
    sessionId: z.string().uuid(),
  }).parse(req.params)

  return next()
}, AnnapayController.generateSessionFinancialReport)

router.post('/prepaid/purchase-charge', async (req, _res, next) => {
  req.body = z.object({
    sessionId: z.string().uuid(),
    userId: z.string().uuid(),
    type: z.enum(['BUYIN', 'REBUY', 'ADDON']),
    chips: z.number().positive(),
  }).parse(req.body)

  return next()
}, AnnapayController.generatePrepaidPurchaseCharge)

router.post('/prepaid/settle/:chargeId', settleLimiter, async (req, _res, next) => {
  req.params = z.object({
    chargeId: z.string().trim().min(1),
  }).parse(req.params)
  z.object({
    virtualAccount: z.string().trim().optional(),
  }).parse(req.query)

  return next()
}, AnnapayController.settlePrepaidCharge)

router.post('/prepaid/settle', settleLimiter, async (req, _res, next) => {
  req.body = z.object({
    chargeId: z.string().trim().min(1),
    virtualAccount: z.string().trim().optional(),
  }).parse(req.body)

  return next()
}, AnnapayController.settlePrepaidChargeByBody)

export default router
