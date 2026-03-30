import { Request, Response } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as EvolutionService from './evolution.service'

export async function setupInstance(req: Request, res: Response) {
  const result = await EvolutionService.setupEvolutionInstance({
    phoneNumber: typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber : null,
  })
  res.status(201).json(result)
}

export async function connectInstance(req: Request, res: Response) {
  const result = await EvolutionService.connectEvolutionInstance()
  res.json(result)
}

export async function instanceStatus(req: Request, res: Response) {
  const result = await EvolutionService.getEvolutionInstanceStatus()
  res.json(result)
}

export async function sendTestMessage(req: Request, res: Response) {
  const result = await EvolutionService.sendEvolutionTextMessage(req.body.phone, req.body.text)
  res.status(201).json(result)
}

export async function listLogs(req: Request, res: Response) {
  const limit = Number(req.query.limit || 50)
  const result = await EvolutionService.listEvolutionMessageLogs(limit)
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