import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../../middlewares/auth.middleware'
import * as EventStaffService from './event-staff.service'
import * as EventSangeurService from '../event/event-sangeur.service'
import { assertEventHost, getEventPermissionMatrix, setEventPermission } from '../../lib/event-auth'
import { z } from 'zod'
import { EventPermissionKey, EventStaffRole } from '@prisma/client'
import { prisma } from '../../lib/prisma'

const router = Router({ mergeParams: true })

const STAFF_ROLES = ['HOST', 'CASHIER', 'DEALER', 'SANGEUR', 'TOURNAMENT_DIRECTOR', 'CASH_DIRECTOR'] as const

const addStaffSchema = z.object({
  cpf: z.string().min(11).max(14),
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
  const cpfDigits = data.cpf.replace(/\D/g, '')
  const user = await prisma.user.findFirst({ where: { cpf: cpfDigits }, select: { id: true } })
  if (!user) throw Object.assign(new Error('Usuário com este CPF não encontrado.'), { statusCode: 404 })
  const staff = await EventStaffService.addStaff(eventId, req.user!.userId, { userId: user.id, role: data.role })

  // Ao adicionar como SANGEUR, cria/ativa o acesso de sangeur automaticamente
  if (data.role === 'SANGEUR') {
    const sangeurResult = await EventSangeurService.enableEventSangeurAccess({
      eventId,
      hostId: req.user!.userId,
      memberUserId: user.id,
    })
    return res.status(201).json({ ...staff, activationQrCode: sangeurResult.activationQrCode })
  }

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