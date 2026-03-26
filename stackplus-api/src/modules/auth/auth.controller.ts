import { Request, Response } from 'express'
import * as AuthService from './auth.service'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { z } from 'zod'

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'HOST', 'PLAYER', 'CASHIER']).optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function register(req: Request, res: Response): Promise<void> {
  const data = registerSchema.parse(req.body)
  const result = await AuthService.register(data)
  res.status(201).json(result)
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = loginSchema.parse(req.body)
  const result = await AuthService.login(email, password)
  res.json(result)
}

export async function me(req: AuthRequest, res: Response): Promise<void> {
  const user = await AuthService.getMe(req.user!.userId)
  res.json(user)
}
