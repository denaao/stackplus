import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import * as EventStaffService from './event-staff.service'
import { assertEventHost, getEventPermissionMatrix, setEventPermission } from '../../lib/event-auth'
import { z } from 'zod'
import { EventPermissionKey, EventStaffRole } from '@prisma/client'

const router = Router({ mergeParams: true })

const STAFF_ROLES = ['HOST', 'CASHIER', 'DEALER', 'SANGEUR', 'TOURNAMENT_DIRECTOR', 'CASH_DIRECTOR'] as const

const addStaffSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(STAFF_ROLES),
})

const updateRoleSchema = z.object({
  role: z.enum(STAFF_ROLES),
})

const setPermissionSchema = z.object({
  role: z.enum(STAFF_ROLES),
  permission: z.nativeEnum(EventPermissionKey),
  allowed: z.boolean(),
})

// ─── Staff CRUD ──────────────────────────────────────────────────────────────

// Listar staff do evento
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { eventId } = req.params
  const staff = await EventStaffService.listStaff(eventId, req.user!.userId)
  res.json(staff)
})

// Adicionar staff
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { eventId } = req.params
  const data = addStaffSchema.parse(req.body)
  const staff = await EventStaffService.addStaff(eventId, req.user!.userId, data)
  res.status(201).json(staff)
})

// Atualizar role do staff
router.patch('/:staffId', authenticate, async (req: AuthRequest, res: Response) => {
  const { eventId, staffId } = req.params
  const { role } = updateRoleSchema.parse(req.body)
  const staff = await EventStaffService.updateStaffRole(eventId, staffId, req.user!.userId, role as EventStaffRole)
  res.json(staff)
})

// Remover staff
router.delete('/:staffId', authenticate, async (req: AuthRequest, res: Response) => {
  const { eventId, staffId } = req.params
  await EventStaffService.removeStaff(eventId, staffId, req.user!.userId)
  res.status(204).send()
})

// ─── Permission config (HOST only) ───────────────────────────────────────────

// GET /events/:eventId/staff/permissions — retorna matriz completa
router.get('/permissions', authenticate, async (req: AuthRequest, res: Response) => {
  const { eventId } = req.params
  await assertEventHost(req.user!.userId, eventId)
  const matrix = await getEventPermissionMatrix(eventId)
  res.json(matrix)
})

// PUT /events/:eventId/staff/permissions — atualiza uma célula da matriz
router.put('/permissions', authenticate, async (req: AuthRequest, res: Response) => {
  const { eventId } = req.params
  await assertEventHost(req.user!.userId, eventId)
  const { role, permission, allowed } = setPermissionSchema.parse(req.body)
  await setEventPermission(eventId, role as EventStaffRole, permission, allowed)
  res.json({ ok: true })
})

export default router
