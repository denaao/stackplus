import { Request, Response } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as EvolutionService from './evolution.service'

export async function setupInstance(req: AuthRequest, res: Response) {
  const hostId = req.user?.userId
  if (!hostId) return res.status(401).json({ error: 'Token não fornecido' })

  const result = await EvolutionService.setupEvolutionInstance(hostId, {
    phoneNumber: typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber : null,
  })
  res.status(201).json(result)
}

export async function connectInstance(req: AuthRequest, res: Response) {
  const hostId = req.user?.userId
  if (!hostId) return res.status(401).json({ error: 'Token não fornecido' })

  const result = await EvolutionService.connectEvolutionInstance(hostId)
  res.json(result)
}

export async function resetInstance(req: AuthRequest, res: Response) {
  const hostId = req.user?.userId
  if (!hostId) return res.status(401).json({ error: 'Token não fornecido' })

  const result = await EvolutionService.resetEvolutionInstance(hostId)
  res.json(result)
}

export async function instanceStatus(req: AuthRequest, res: Response) {
  const hostId = req.user?.userId
  if (!hostId) return res.status(401).json({ error: 'Token não fornecido' })

  const result = await EvolutionService.getEvolutionInstanceStatus(hostId)
  res.json(result)
}

export async function sendTestMessage(req: AuthRequest, res: Response) {
  const hostId = req.user?.userId
  if (!hostId) return res.status(401).json({ error: 'Token não fornecido' })

  const result = await EvolutionService.sendEvolutionTextMessage(hostId, req.body.phone, req.body.text)
  res.status(201).json(result)
}

export async function listLogs(req: AuthRequest, res: Response) {
  const hostId = req.user?.userId
  if (!hostId) return res.status(401).json({ error: 'Token não fornecido' })

  const limit = Number(req.query.limit || 50)
  const result = await EvolutionService.listEvolutionMessageLogs(hostId, limit)
  res.json(result)
}

export async function receiveWebhook(req: Request, res: Response) {
  const result = await EvolutionService.handleEvolutionWebhook(req.body, req.headers['x-stackplus-webhook-secret'])
  res.status(200).json(result)
}

export async function notifySessionResults(req: AuthRequest, res: Response) {
  const result = await EvolutionService.notifySessionFinished(req.params.sessionId, req.user?.userId)
  res.json(result)
}