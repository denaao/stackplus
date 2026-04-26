import { Router, Response, Request } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import { destructiveLimiter } from '../../middlewares/rate-limit.middleware'
import * as HomeGameService from './homegame.service'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { hashPassword } from '../../utils/hash'

const router = Router()

const createSchema = z.object({
  name: z.string().min(2),
  address: z.string().min(5),
  financialModule: z.enum(['POSTPAID', 'PREPAID', 'HYBRID']).optional(),
})

const financialConfigSchema = z.object({
  financialModule: z.enum(['POSTPAID', 'PREPAID', 'HYBRID']),
  hybridMembers: z.array(z.object({
    userId: z.string().uuid(),
    paymentMode: z.enum(['POSTPAID', 'PREPAID']),
  })).optional(),
})

const enableSangeurSchema = z.object({
  userId: z.string().uuid(),
  username: z.string().trim().min(3).max(40),
  password: z.string().trim().min(6).max(120).optional(),
})

const resetSangeurPasswordSchema = z.object({
  password: z.string().trim().min(6).max(120).optional(),
})

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.parse(req.body)
  const data = {
    ...parsed,
    gameType: 'CASH_GAME' as const,
    dayOfWeek: 'A combinar',
    startTime: '20:00',
    chipValue: 1,
    rules: undefined,
    buyInAmount: undefined,
    rebuyAmount: undefined,
    addOnAmount: undefined,
    blindsMinutesBeforeBreak: undefined,
    blindsMinutesAfterBreak: undefined,
    levelsUntilBreak: undefined,
  }
  const game = await HomeGameService.createHomeGame(req.user!.userId, data)
  res.status(201).json(game)
})

router.get('/mine', authenticate, async (req: AuthRequest, res: Response) => {
  const games = await HomeGameService.getHostGames(req.user!.userId)
  res.json(games)
})

router.get('/member', authenticate, async (req: AuthRequest, res: Response) => {
  const games = await HomeGameService.getPlayerGames(req.user!.userId)
  res.json(games)
})

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const game = await HomeGameService.getHomeGameByIdForUser(req.params.id, req.user!.userId)
  res.json(game)
})

router.patch('/:id/financial-config', authenticate, async (req: AuthRequest, res: Response) => {
  const data = financialConfigSchema.parse(req.body)
  const game = await HomeGameService.updateFinancialConfig(req.params.id, req.user!.userId, data)
  res.json(game)
})

router.get('/:id/sangeurs', authenticate, async (req: AuthRequest, res: Response) => {
  const accesses = await HomeGameService.listSangeurAccesses(req.params.id, req.user!.userId)
  res.json(accesses)
})

router.post('/:id/sangeurs', authenticate, async (req: AuthRequest, res: Response) => {
  const data = enableSangeurSchema.parse(req.body)
  const result = await HomeGameService.enableSangeurAccess({
    homeGameId: req.params.id,
    hostId: req.user!.userId,
    memberUserId: data.userId,
    username: data.username,
    password: data.password,
  })
  res.status(201).json(result)
})

router.patch('/:id/sangeurs/:userId/disable', authenticate, async (req: AuthRequest, res: Response) => {
  const access = await HomeGameService.disableSangeurAccess(req.params.id, req.user!.userId, req.params.userId)
  res.json(access)
})

router.patch('/:id/sangeurs/:userId/reset-password', authenticate, async (req: AuthRequest, res: Response) => {
  const data = resetSangeurPasswordSchema.parse(req.body)
  const result = await HomeGameService.resetSangeurPassword({
    homeGameId: req.params.id,
    hostId: req.user!.userId,
    memberUserId: req.params.userId,
    password: data.password,
  })
  res.json(result)
})

router.delete('/:id', authenticate, destructiveLimiter, async (req: AuthRequest, res: Response) => {
  await HomeGameService.deleteHomeGame(req.params.id, req.user!.userId)

  // SEC-008: audit trail pra delete de home game (destrutivo e em cascata).
  const { logAudit } = await import('../../lib/audit')
  await logAudit({
    userId: req.user?.userId,
    action: 'HOMEGAME_DELETE',
    resource: 'HomeGame',
    resourceId: req.params.id,
    ip: req.ip,
    userAgent: String(req.headers['user-agent'] || ''),
  })

  res.status(204).send()
})

const setMemberRoleSchema = z.object({
  role: z.enum(['HOST', 'PLAYER', 'DEALER', 'SANGEUR']),
})

router.patch('/:id/members/:userId/role', authenticate, async (req: AuthRequest, res: Response) => {
  const data = setMemberRoleSchema.parse(req.body)
  const result = await HomeGameService.setMemberRole({
    homeGameId: req.params.id,
    ownerUserId: req.user!.userId,
    memberUserId: req.params.userId,
    role: data.role,
  })

  // SEC-008: audit trail pra mudança de papel (promover/rebaixar host).
  const { logAudit } = await import('../../lib/audit')
  await logAudit({
    userId: req.user?.userId,
    action: 'HOMEGAME_ROLE_CHANGE',
    resource: 'HomeGameMember',
    resourceId: req.params.userId,
    metadata: { homeGameId: req.params.id, newRole: data.role },
    ip: req.ip,
    userAgent: String(req.headers['user-agent'] || ''),
  })

  res.json(result)
})

router.post('/join', authenticate, async (req: AuthRequest, res: Response) => {
  const { joinCode } = z.object({ joinCode: z.string().length(6) }).parse(req.body)
  const game = await HomeGameService.joinHomeGame(req.user!.userId, joinCode.toUpperCase())
  res.json(game)
})

// Dashboard unificado: retorna meus home games separados por papel.
router.get('/mine/with-roles', authenticate, async (req: AuthRequest, res: Response) => {
  const result = await HomeGameService.getMyHomeGamesWithRoles(req.user!.userId)
  res.json(result)
})

// QR Code individual por SANGEUR — embutido homeGameId + username, ela só digita a senha
router.get('/:id/sangeur-login-qr', authenticate, async (req: AuthRequest, res: Response) => {
  const homeGameId = req.params.id
  const username = typeof req.query.username === 'string' ? req.query.username.trim() : ''
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  const params = new URLSearchParams({ homeGameId })
  if (username) params.set('username', username)
  const loginUrl = `${frontendUrl}/sangeur/login?${params.toString()}`
  const QRCode = await import('qrcode')
  const qrBase64 = await QRCode.toDataURL(loginUrl, { width: 220, margin: 2 })
  return res.json({ qrCode: qrBase64, loginUrl })
})

// ─── Ativação de conta SANGEUR via QR Code (rotas públicas, sem autenticação) ───

// Valida se o token ainda é válido (GET) — frontend usa ao carregar a página
router.get('/sangeur/activate/:token', async (req: Request, res: Response) => {
  const { token } = req.params

  const access = await prisma.homeGameSangeurAccess.findUnique({
    where: { activationToken: token },
    select: {
      username: true,
      activationTokenExpiresAt: true,
      homeGame: { select: { name: true } },
    },
  })

  if (!access || !access.activationTokenExpiresAt) {
    return res.status(404).json({ valid: false, message: 'Link inválido ou já utilizado.' })
  }

  if (new Date() > access.activationTokenExpiresAt) {
    return res.status(410).json({ valid: false, message: 'Link expirado. Peça ao admin para gerar um novo QR Code.' })
  }

  return res.json({
    valid: true,
    username: access.username,
    homeGameName: access.homeGame.name,
  })
})

// Ativa a conta definindo a senha escolhida pela SANGEUR (POST)
router.post('/sangeur/activate', async (req: Request, res: Response) => {
  const { token, password } = z.object({
    token: z.string().min(1),
    password: z.string().min(6).max(120),
  }).parse(req.body)

  const access = await prisma.homeGameSangeurAccess.findUnique({
    where: { activationToken: token },
    select: {
      homeGameId: true,
      userId: true,
      username: true,
      activationTokenExpiresAt: true,
    },
  })

  if (!access || !access.activationTokenExpiresAt) {
    return res.status(404).json({ message: 'Link inválido ou já utilizado.' })
  }

  if (new Date() > access.activationTokenExpiresAt) {
    return res.status(410).json({ message: 'Link expirado. Peça ao admin para gerar um novo QR Code.' })
  }

  const passwordHash = await hashPassword(password)

  await prisma.homeGameSangeurAccess.update({
    where: {
      homeGameId_userId: {
        homeGameId: access.homeGameId,
        userId: access.userId,
      },
    },
    data: {
      passwordHash,
      isActive: true,
      mustChangePassword: false,
      activationToken: null,
      activationTokenExpiresAt: null,
    },
  })

  return res.json({ message: 'Conta ativada com sucesso. Você já pode fazer login no POS.' })
})

export default router
