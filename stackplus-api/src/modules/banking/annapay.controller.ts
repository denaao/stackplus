import { Request, Response } from 'express'
import crypto from 'crypto'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as AnnapayService from './annapay.service'
import { emitSessionRankingUpdated, getIO, getPrivateSessionRoom } from '../../socket/socket'

/**
 * Compara dois secrets em tempo constante para mitigar timing attacks.
 * Retorna false se qualquer um estiver vazio ou com tamanhos diferentes.
 */
function safeCompareSecrets(provided: string, configured: string): boolean {
  if (!provided || !configured) return false
  const providedBuf = Buffer.from(provided, 'utf8')
  const configuredBuf = Buffer.from(configured, 'utf8')
  if (providedBuf.length !== configuredBuf.length) return false
  try {
    return crypto.timingSafeEqual(providedBuf, configuredBuf)
  } catch {
    return false
  }
}

export async function login(_req: AuthRequest, res: Response) {
  const data = await AnnapayService.testLogin()
  return res.json(data)
}

export async function listAccounts(_req: AuthRequest, res: Response) {
  const data = await AnnapayService.listAccounts()
  return res.json(data)
}

export async function listWebhooks(req: AuthRequest, res: Response) {
  const virtualAccount = typeof req.query.virtualAccount === 'string' ? req.query.virtualAccount : null
  const data = await AnnapayService.listWebhooks(virtualAccount)
  return res.json(data)
}

export async function syncCobWebhook(req: AuthRequest, res: Response) {
  const virtualAccount = typeof req.query.virtualAccount === 'string' ? req.query.virtualAccount : null
  const data = await AnnapayService.syncCobWebhookConfig(virtualAccount)
  return res.json(data)
}

export async function getBalance(req: AuthRequest, res: Response) {
  const virtualAccount = typeof req.query.virtualAccount === 'string' ? req.query.virtualAccount : null
  const data = await AnnapayService.getBalance(virtualAccount)
  return res.json(data)
}

export async function getStatements(req: AuthRequest, res: Response) {
  const data = await AnnapayService.getStatements({
    inicio: String(req.query.Inicio),
    fim: String(req.query.Fim),
    tipo: typeof req.query.Tipo === 'string' ? req.query.Tipo : undefined,
    itensPorPagina: req.query['Paginacao.ItensPorPagina'] ? Number(req.query['Paginacao.ItensPorPagina']) : undefined,
    paginaAtual: req.query['Paginacao.paginaAtual'] ? Number(req.query['Paginacao.paginaAtual']) : undefined,
    virtualAccount: typeof req.query.virtualAccount === 'string' ? req.query.virtualAccount : null,
  })

  return res.json(data)
}

export async function createCob(req: AuthRequest, res: Response) {
  const virtualAccount = typeof req.query.virtualAccount === 'string' ? req.query.virtualAccount : null
  const data = await AnnapayService.createCob(req.body, virtualAccount)
  return res.status(201).json(data)
}

export async function getCobById(req: AuthRequest, res: Response) {
  const virtualAccount = typeof req.query.virtualAccount === 'string' ? req.query.virtualAccount : null
  const data = await AnnapayService.getCobById(req.params.id, virtualAccount)
  return res.json(data)
}

export async function createPix(req: AuthRequest, res: Response) {
  const data = await AnnapayService.createPix(req.body)
  return res.status(201).json(data)
}

export async function confirmPix(req: AuthRequest, res: Response) {
  const data = await AnnapayService.confirmPix(req.params.id)
  return res.json(data)
}

export async function generateSessionFinancialReport(req: AuthRequest, res: Response) {
  const data = await AnnapayService.generateSessionFinancialReport(req.params.sessionId, req.user!.userId)
  return res.json(data)
}

export async function generatePrepaidPurchaseCharge(req: AuthRequest, res: Response) {
  const data = await AnnapayService.generatePrepaidPurchaseCharge({
    ...req.body,
    requestedBy: req.user!.userId,
  })
  return res.status(201).json(data)
}

export async function settlePrepaidCharge(req: AuthRequest, res: Response) {
  const virtualAccount = typeof req.query.virtualAccount === 'string' ? req.query.virtualAccount : null
  const data = await AnnapayService.settlePrepaidChargeById(req.params.chargeId, virtualAccount)

  if (data.settled && data.sessionId && data.transactionResult) {
    try {
      const io = getIO()
      io.to(getPrivateSessionRoom(data.sessionId)).emit('transaction:new', data.transactionResult)

      const { getRanking } = await import('../ranking/ranking.service')
      const ranking = await getRanking(data.sessionId)
      emitSessionRankingUpdated(data.sessionId, ranking)
    } catch (error) {
      console.warn('[annapay settle] realtime broadcast failed:', error)
    }
  }

  return res.json(data)
}

export async function settlePrepaidChargeByBody(req: AuthRequest, res: Response) {
  const chargeId = String(req.body?.chargeId || '').trim()
  const virtualAccount = typeof req.body?.virtualAccount === 'string' ? req.body.virtualAccount : null
  const data = await AnnapayService.settlePrepaidChargeById(chargeId, virtualAccount)

  if (data.settled && data.sessionId && data.transactionResult) {
    try {
      const io = getIO()
      io.to(getPrivateSessionRoom(data.sessionId)).emit('transaction:new', data.transactionResult)

      const { getRanking } = await import('../ranking/ranking.service')
      const ranking = await getRanking(data.sessionId)
      emitSessionRankingUpdated(data.sessionId, ranking)
    } catch (error) {
      console.warn('[annapay settle body] realtime broadcast failed:', error)
    }
  }

  return res.json(data)
}

export async function handleCobWebhook(req: Request, res: Response) {
  const configuredSecret = process.env.ANNAPAY_WEBHOOK_SECRET?.trim()

  if (configuredSecret) {
    const providedSecret = String(
      req.headers['x-annapay-webhook-secret'] || req.headers['x-webhook-secret'] || '',
    ).trim()

    // Header ausente: provavelmente healthcheck de registro do webhook.
    // Mantém 200 pra não quebrar o handshake do provider.
    if (!providedSecret) {
      return res
        .status(200)
        .json({ received: true, ignored: 'missing-webhook-secret' })
    }

    // Header presente mas inválido: bloqueia e registra tentativa.
    // Timing-safe compare evita vazar o secret via side-channel.
    if (!safeCompareSecrets(providedSecret, configuredSecret)) {
      console.warn('[annapay webhook] invalid secret attempt', {
        ip: req.ip,
        userAgent: String(req.headers['user-agent'] || ''),
        path: req.path,
      })
      return res
        .status(401)
        .json({ received: false, ignored: 'invalid-webhook-secret' })
    }
  }

  const result = await AnnapayService.settlePrepaidChargeFromWebhook(req.body)

  if (result.processed && result.reason === 'registered' && result.transactionResult) {
    try {
      const io = getIO()
      io.to(getPrivateSessionRoom(result.sessionId)).emit('transaction:new', result.transactionResult)

      const { getRanking } = await import('../ranking/ranking.service')
      const ranking = await getRanking(result.sessionId)
      emitSessionRankingUpdated(result.sessionId, ranking)
    } catch (error) {
      console.warn('[annapay webhook] realtime broadcast failed:', error)
    }
  }

  return res.status(200).json(result)
}
