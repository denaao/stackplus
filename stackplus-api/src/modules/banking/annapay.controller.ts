import { Response } from 'express'
import { AuthRequest } from '../../middlewares/auth.middleware'
import * as AnnapayService from './annapay.service'

export async function login(_req: AuthRequest, res: Response) {
  const data = await AnnapayService.testLogin()
  return res.json(data)
}

export async function listAccounts(_req: AuthRequest, res: Response) {
  const data = await AnnapayService.listAccounts()
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
  })

  return res.json(data)
}

export async function createCob(req: AuthRequest, res: Response) {
  const virtualAccount = typeof req.query.virtualAccount === 'string' ? req.query.virtualAccount : null
  const data = await AnnapayService.createCob(req.body, virtualAccount)
  return res.status(201).json(data)
}

export async function getCobById(req: AuthRequest, res: Response) {
  const data = await AnnapayService.getCobById(req.params.id)
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
  const data = await AnnapayService.generatePrepaidPurchaseCharge(req.body)
  return res.status(201).json(data)
}
