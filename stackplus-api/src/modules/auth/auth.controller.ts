import { Request, Response } from 'express'
import * as AuthService from './auth.service'
import { AuthRequest } from '../../middlewares/auth.middleware'
import { z } from 'zod'
import { passwordSchema } from '../../utils/password'

const pixTypeEnum = z.enum(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'])

function isSequentialFirst9(digits: string): boolean {
  const first9 = digits.slice(0, 9)
  let asc = true
  let desc = true
  for (let i = 1; i < first9.length; i += 1) {
    const prev = Number(first9[i - 1])
    const curr = Number(first9[i])
    if (curr !== (prev + 1) % 10) asc = false
    if (curr !== (prev - 1 + 10) % 10) desc = false
  }
  return asc || desc
}

function isValidCpf(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false
  if (isSequentialFirst9(digits)) return false

  let sum = 0
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i)
  let firstVerifier = (sum * 10) % 11
  if (firstVerifier === 10) firstVerifier = 0
  if (firstVerifier !== Number(digits[9])) return false

  sum = 0
  for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (11 - i)
  let secondVerifier = (sum * 10) % 11
  if (secondVerifier === 10) secondVerifier = 0
  return secondVerifier === Number(digits[10])
}

function isValidCnpj(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 14) return false
  if (/^(\d)\1{13}$/.test(digits)) return false

  const calcVerifier = (base: string, weights: number[]) => {
    const sum = base
      .split('')
      .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0)
    const mod = sum % 11
    return mod < 2 ? 0 : 11 - mod
  }

  const first = calcVerifier(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const second = calcVerifier(digits.slice(0, 12) + String(first), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])

  return first === Number(digits[12]) && second === Number(digits[13])
}

// ─── Shared PIX + phone refinement ───────────────────────────────────────────

function refinePixAndPhone(
  data: { pixType?: string; pixKey?: string; phone?: string },
  ctx: z.RefinementCtx,
) {
  if (data.pixKey !== undefined && data.pixType !== undefined) {
    const raw = data.pixKey.trim()
    const digits = raw.replace(/\D/g, '')

    if (data.pixType === 'CPF' && !isValidCpf(raw)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pixKey'], message: 'PIX CPF inválido' })
    }
    if (data.pixType === 'CNPJ' && !isValidCnpj(raw)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pixKey'], message: 'PIX CNPJ inválido' })
    }
    if (data.pixType === 'PHONE' && (digits.length < 10 || digits.length > 13)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pixKey'], message: 'PIX telefone deve ter entre 10 e 13 dígitos' })
    }
    if (data.pixType === 'EMAIL' && !z.string().email().safeParse(raw).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pixKey'], message: 'PIX email inválido' })
    }
    if (data.pixType === 'RANDOM') {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(raw)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pixKey'], message: 'PIX chave aleatória deve ser um UUID válido' })
      }
    }
  }

  if (data.phone !== undefined && data.phone.trim() !== '') {
    const phoneDigits = data.phone.replace(/\D/g, '')
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'Telefone deve ter 10 ou 11 dígitos' })
    }
  }
}

// ─── Register schema ──────────────────────────────────────────────────────────
// z.discriminatedUnion não aceita ZodEffects (resultado de .superRefine).
// Usamos z.object flat + superRefine, igual ao loginSchema.

const registerSchema = z.object({
  documentType: z.enum(['CPF', 'PASSPORT']).default('CPF'),
  // campos CPF
  cpf: z.string().trim().optional(),
  // campos PASSPORT
  passportNumber: z.string().trim().max(30).optional(),
  nationality: z.string().trim().max(80).optional(),
  // campos comuns
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().trim().optional(),
  password: passwordSchema,
  pixType: pixTypeEnum.optional(),
  pixKey: z.string().trim().max(120).optional(),
}).superRefine((data, ctx) => {
  if (data.documentType === 'CPF') {
    if (!data.cpf || data.cpf.length < 11) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cpf'], message: 'CPF obrigatório' })
    } else if (!isValidCpf(data.cpf)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cpf'], message: 'CPF inválido' })
    }
    if (!data.pixType) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pixType'], message: 'Tipo de PIX obrigatório' })
    }
    if (!data.pixKey || data.pixKey.trim().length < 3) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pixKey'], message: 'Chave PIX obrigatória' })
    }
  } else {
    if (!data.passportNumber || data.passportNumber.trim().length < 3) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['passportNumber'], message: 'Número do passaporte obrigatório' })
    }
    if (!data.nationality || data.nationality.trim().length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nationality'], message: 'Nacionalidade obrigatória' })
    }
  }
  refinePixAndPhone(data, ctx)
})

// ─── Login schema ─────────────────────────────────────────────────────────────
// Usa z.object simples com superRefine para evitar limitações do discriminatedUnion + .or()

const loginSchema = z.object({
  documentType: z.enum(['CPF', 'PASSPORT']).optional(),
  cpf: z.string().trim().optional(),
  passportNumber: z.string().trim().optional(),
  password: z.string().min(1),
}).superRefine((data, ctx) => {
  const docType = data.documentType ?? 'CPF'
  if (docType === 'CPF') {
    if (!data.cpf || data.cpf.length < 11) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cpf'], message: 'CPF obrigatório' })
    }
  } else {
    if (!data.passportNumber || data.passportNumber.trim().length < 3) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['passportNumber'], message: 'Número do passaporte obrigatório' })
    }
  }
})

const sangeurLoginSchema = z.object({
  homeGameId: z.string().uuid(),
  cpf: z.string().trim().min(11),
  password: z.string().min(1),
})

const eventSangeurLoginSchema = z.object({
  eventId: z.string().uuid(),
  cpf: z.string().trim().min(11),
  password: z.string().min(1),
})

const sangeurChangePasswordSchema = z.object({
  homeGameId: z.string().uuid(),
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
})

export async function register(req: Request, res: Response): Promise<void> {
  const data = registerSchema.parse(req.body)

  if (data.documentType === 'CPF') {
    const result = await AuthService.register({
      documentType: 'CPF',
      cpf: data.cpf!,
      name: data.name,
      email: data.email || undefined,
      phone: data.phone,
      password: data.password,
      pixType: data.pixType!,
      pixKey: data.pixKey!,
    })
    res.status(201).json(result)
    return
  }

  // PASSPORT
  const result = await AuthService.register({
    documentType: 'PASSPORT',
    passportNumber: data.passportNumber!,
    nationality: data.nationality!,
    name: data.name,
    email: data.email || undefined,
    phone: data.phone,
    password: data.password,
    pixType: data.pixType,
    pixKey: data.pixKey,
  })
  res.status(201).json(result)
}

export async function login(req: Request, res: Response): Promise<void> {
  const data = loginSchema.parse(req.body)
  const context = { ip: req.ip ?? null, userAgent: String(req.headers['user-agent'] ?? '') || null }

  if (data.documentType === 'PASSPORT') {
    const result = await AuthService.loginByPassport(data.passportNumber!, data.password, context)
    res.json(result)
    return
  }

  // CPF (ou sem documentType — retrocompatível)
  const result = await AuthService.login(data.cpf!, data.password, context)
  res.json(result)
}

const refreshSchema = z.object({
  refreshToken: z.string().trim().min(1),
})

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = refreshSchema.parse(req.body)
  const result = await AuthService.refreshSession(refreshToken, {
    ip: req.ip ?? null,
    userAgent: String(req.headers['user-agent'] ?? '') || null,
  })
  res.json(result)
}

export async function logout(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user?.userId) {
    res.status(401).json({ error: 'Não autenticado' })
    return
  }
  const result = await AuthService.logout(req.user.userId)
  res.json(result)
}

export async function loginSangeur(req: Request, res: Response): Promise<void> {
  const { homeGameId, cpf, password } = sangeurLoginSchema.parse(req.body)
  const result = await AuthService.loginSangeur(homeGameId, cpf, password)
  res.json(result)
}

export async function loginEventSangeur(req: Request, res: Response): Promise<void> {
  const { eventId, cpf, password } = eventSangeurLoginSchema.parse(req.body)
  const result = await AuthService.loginEventSangeur(eventId, cpf, password)
  res.json(result)
}

export async function me(req: AuthRequest, res: Response): Promise<void> {
  const user = await AuthService.getMe(req.user!.userId)
  res.json(user)
}

const updateMeSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  cpf: z.string().trim().max(20).optional(),
  email: z.string().email().nullable().optional().or(z.literal('')),
  phone: z.string().trim().max(20).nullable().optional(),
  pixType: pixTypeEnum.optional(),
  pixKey: z.string().trim().min(3).max(120).optional(),
}).superRefine((data, ctx) => {
  if (data.cpf !== undefined && data.cpf.trim() !== '' && !isValidCpf(data.cpf)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cpf'], message: 'CPF inválido' })
  }

  if (data.phone !== undefined && data.phone !== null && data.phone.trim() !== '') {
    const phoneDigits = data.phone.replace(/\D/g, '')
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'Telefone deve ter 10 ou 11 dígitos' })
    }
  }

  if (!data.pixType && !data.pixKey) return
  if (!data.pixType || !data.pixKey) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pixType'], message: 'Informe tipo e chave PIX juntos para atualizar o PIX' })
    return
  }

  const raw = data.pixKey.trim()
  const digits = raw.replace(/\D/g, '')

  if (data.pixType === 'CPF' && !isValidCpf(raw)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pixKey'], message: 'PIX CPF inválido' })
  }
  if (data.pixType === 'CNPJ' && !isValidCnpj(raw)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pixKey'], message: 'PIX CNPJ inválido' })
  }
  if (data.pixType === 'PHONE' && (digits.length < 10 || digits.length > 13)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pixKey'], message: 'PIX telefone deve ter entre 10 e 13 dígitos' })
  }
  if (data.pixType === 'EMAIL' && !z.string().email().safeParse(raw).success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pixKey'], message: 'PIX email inválido' })
  }
  if (data.pixType === 'RANDOM' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pixKey'], message: 'Chave aleatória deve ser um UUID válido' })
  }
})

export async function updateMe(req: AuthRequest, res: Response): Promise<void> {
  const data = updateMeSchema.parse(req.body)
  const user = await AuthService.updateMe(req.user!.userId, {
    ...data,
    email: data.email === '' ? null : data.email,
  })
  res.json(user)
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
})

export async function changePassword(req: AuthRequest, res: Response): Promise<void> {
  const data = changePasswordSchema.parse(req.body)
  const result = await AuthService.changeUserPassword({
    userId: req.user!.userId,
    currentPassword: data.currentPassword,
    newPassword: data.newPassword,
  })
  res.json(result)
}

export async function changeSangeurPassword(req: AuthRequest, res: Response): Promise<void> {
  const data = sangeurChangePasswordSchema.parse(req.body)
  const result = await AuthService.changeSangeurPassword({
    userId: req.user!.userId,
    homeGameId: data.homeGameId,
    currentPassword: data.currentPassword,
    newPassword: data.newPassword,
  })
  res.json(result)
}
