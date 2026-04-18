import { prisma } from '../../lib/prisma'
import { TransactionType } from '@prisma/client'
import { randomUUID } from 'crypto'
import { isHomeGameHost } from '../../lib/homegame-auth'

type PayoutPurposeValue = 'SETTLEMENT' | 'CAIXINHA'

type PendingChargeRow = {
  chargeId: string
  sessionId: string
  userId: string
  virtualAccount: string | null
  type: string
  chips: string | number
  amount: string | number
  registeredBy: string
  status: string
}

type SessionFinancialChargePendingRow = {
  chargeId: string
  sessionId: string
  userId: string
  virtualAccount: string | null
  amount: string | number
  status: string
  updatedAt: string
}

type SessionFinancialPayoutPendingRow = {
  sessionId: string
  userId: string
  purpose: PayoutPurposeValue
  payoutOrderId: string
  virtualAccount: string | null
  amount: string | number
  status: string
  updatedAt: string
}

type AnnapayTokenCache = {
  token: string
  expiresAt: number
}

type AnnapayRequestOptions = {
  method: 'GET' | 'POST' | 'PUT'
  path: string
  query?: Record<string, string | number | undefined>
  body?: unknown
  virtualAccount?: string | null
}

type StatementsInput = {
  inicio: string
  fim: string
  tipo?: string
  itensPorPagina?: number
  paginaAtual?: number
  virtualAccount?: string | null
}

type CreateCobInput = {
  calendario: {
    expiracao: number
  }
  devedor: {
    cpf?: string | null
    cnpj?: string | null
    nome: string
  }
  valor: {
    original: string
  }
  solicitacaoPagador?: string
}

type CreatePixInput = {
  valor: number
  descricao?: string
  destinatario: {
    tipo: 'CHAVE'
    chave: string
    cpfCnpjRecebedor: string
  }
}

type ResolvedPlayerMode = 'POSTPAID' | 'PREPAID'
type FinancialModuleValue = 'POSTPAID' | 'PREPAID' | 'HYBRID'
type MemberPaymentModeValue = 'POSTPAID' | 'PREPAID' | null

type NormalizedCobResult = {
  id: string | null
  pixCopyPaste: string | null
  qrCodeBase64: string | null
  virtualAccount: string | null
  raw: unknown
}

type AnnapayConfig = {
  baseUrl: string
  clientID: string
  clientSecret: string
  defaultVirtualAccount: string | null
}

type AnnapayWebhookUpsertInput = {
  uri_pix: string
  uri_cashout: string
  uri_statement: string
  secret?: string
}

let tokenCache: AnnapayTokenCache | null = null

function getConfig(): AnnapayConfig {
  const baseUrl = (process.env.ANNAPAY_BASE_URL || 'https://api.annapay.com.br').trim().replace(/\/+$/, '')
  const clientID = process.env.ANNAPAY_CLIENT_ID?.trim()
  const clientSecret = process.env.ANNAPAY_CLIENT_SECRET?.trim()
  const defaultVirtualAccount = process.env.ANNAPAY_VIRTUAL_ACCOUNT_ID?.trim() || null

  if (!clientID) throw new Error('Annapay não configurada: ANNAPAY_CLIENT_ID ausente')
  if (!clientSecret) throw new Error('Annapay não configurada: ANNAPAY_CLIENT_SECRET ausente')

  return {
    baseUrl,
    clientID,
    clientSecret,
    defaultVirtualAccount,
  }
}

function decodeJwtExpiration(token: string): number {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return Date.now() + (5 * 60 * 1000)

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as { exp?: number }
    if (!payload.exp) return Date.now() + (5 * 60 * 1000)

    return payload.exp * 1000
  } catch {
    return Date.now() + (5 * 60 * 1000)
  }
}

async function parseResponse(response: Response): Promise<unknown> {
  const raw = await response.text()
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function extractValidationDetails(payload: unknown): string[] {
  const out: string[] = []
  const data = payload as Record<string, unknown> | null
  if (!data) return out

  const details = data.details
  if (Array.isArray(details)) {
    details.forEach((item) => {
      if (typeof item === 'string' && item.trim()) {
        out.push(item.trim())
        return
      }

      if (!item || typeof item !== 'object') return
      const row = item as Record<string, unknown>
      const field = typeof row.campo === 'string' ? row.campo : (typeof row.path === 'string' ? row.path : null)
      const message = typeof row.mensagem === 'string'
        ? row.mensagem
        : (typeof row.message === 'string' ? row.message : null)

      if (field && message) {
        out.push(`${field}: ${message}`)
      } else if (message) {
        out.push(message)
      }
    })
  }

  return out
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') {
    const normalized = payload.toLowerCase()
    const annapayOutageSignals = [
      'error code 522',
      'connection timed out',
      'cloudflare',
      'api.annapay.com.br',
    ]

    if (annapayOutageSignals.some((signal) => normalized.includes(signal))) {
      return 'ANNAPAY/ANNABANK fora do ar no momento. Tente novamente em alguns minutos.'
    }

    return payload
  }

  const data = payload as Record<string, unknown> | null
  if (!data) return fallback

  const detailList = extractValidationDetails(payload)

  const message = data.message || data.error || data.details
  if (typeof message === 'string' && message.trim()) {
    if (detailList.length > 0) {
      return `${message} | ${detailList.join(' | ')}`
    }

    const normalizedMessage = message.toLowerCase()
    if (normalizedMessage.includes('valida')) {
      try {
        const raw = JSON.stringify(data)
        if (raw && raw !== '{}') return `${message} | payload: ${raw}`
      } catch {
        // ignore serialization issues
      }
    }

    return message
  }

  if (detailList.length > 0) return detailList.join(' | ')

  return fallback
}

async function login(forceRefresh = false): Promise<string> {
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now() + 15_000) {
    return tokenCache.token
  }

  const config = getConfig()
  const response = await fetch(`${config.baseUrl}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientID: config.clientID,
      clientSecret: config.clientSecret,
    }),
  })

  const payload = await parseResponse(response)
  if (!response.ok) {
    const message = extractErrorMessage(payload, `Falha ao autenticar na Annapay (${response.status})`)
    throw new Error(message)
  }

  const token = (payload as any)?.token || (payload as any)?.accessToken || (payload as any)?.jwt
  if (!token || typeof token !== 'string') {
    throw new Error('Resposta de login da Annapay sem token JWT')
  }

  tokenCache = {
    token,
    expiresAt: decodeJwtExpiration(token),
  }

  return token
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const config = getConfig()
  const url = new URL(`${config.baseUrl}${path}`)

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      url.searchParams.set(key, String(value))
    })
  }

  return url.toString()
}

function resolveVirtualAccount(virtualAccount?: string | null): string {
  const config = getConfig()
  const value = virtualAccount?.trim() || config.defaultVirtualAccount
  if (!value) {
    throw new Error('virtualAccount é obrigatório. Informe na requisição ou configure ANNAPAY_VIRTUAL_ACCOUNT_ID')
  }
  return value
}

function resolveApiBaseUrl(): string | null {
  const explicit = process.env.API_PUBLIC_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')

  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim()
  if (railwayDomain) return `https://${railwayDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`

  const frontend = process.env.BACKEND_URL?.trim()
  if (frontend) return frontend.replace(/\/+$/, '')

  return null
}

function buildWebhookTargetUrl(): string {
  const explicit = process.env.ANNAPAY_WEBHOOK_URL?.trim()
  if (explicit) return explicit

  const baseUrl = resolveApiBaseUrl()
  if (!baseUrl) {
    throw new Error('Configure ANNAPAY_WEBHOOK_URL ou API_PUBLIC_URL para sincronizar webhook da Annapay')
  }

  return `${baseUrl}/api/banking/annapay/webhooks/cob`
}

async function requestWithAuth<T>(options: AnnapayRequestOptions): Promise<T> {
  const call = async (forceRefresh: boolean): Promise<Response> => {
    const token = await login(forceRefresh)
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    if (options.virtualAccount) {
      headers.virtualAccount = options.virtualAccount
    }

    return fetch(buildUrl(options.path, options.query), {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  }

  let response = await call(false)
  if (response.status === 401) {
    response = await call(true)
  }

  const payload = await parseResponse(response)
  if (!response.ok) {
    const message = extractErrorMessage(payload, `Erro Annapay (${response.status}) em ${options.path}`)
    throw new Error(message)
  }

  return payload as T
}

export async function listAccounts() {
  return requestWithAuth<unknown>({
    method: 'GET',
    path: '/accounts',
  })
}

export async function listWebhooks(virtualAccount?: string | null) {
  return requestWithAuth<unknown>({
    method: 'GET',
    path: '/webhook',
    virtualAccount: resolveVirtualAccount(virtualAccount),
  })
}

async function upsertWebhook(input: AnnapayWebhookUpsertInput, virtualAccount?: string | null) {
  const resolvedVirtualAccount = resolveVirtualAccount(virtualAccount)

  // Annapay currently exposes webhook upsert via PUT.
  // Avoid POST fallback because it can hide the real validation error from PUT.
  return requestWithAuth<unknown>({
    method: 'PUT',
    path: '/webhook',
    virtualAccount: resolvedVirtualAccount,
    body: input,
  })
}

export async function syncCobWebhookConfig(virtualAccount?: string | null) {
  const secret = process.env.ANNAPAY_WEBHOOK_SECRET?.trim()
  const payload: AnnapayWebhookUpsertInput = {
    uri_pix: buildWebhookTargetUrl(),
    uri_cashout: '',
    uri_statement: '',
    ...(secret ? { secret } : {}),
  }

  const data = await upsertWebhook(payload, virtualAccount)
  return {
    synced: true,
    payload,
    data,
  }
}

export async function getBalance(virtualAccount?: string | null) {
  return requestWithAuth<unknown>({
    method: 'GET',
    path: '/balance',
    virtualAccount: resolveVirtualAccount(virtualAccount),
  })
}

export async function getStatements(input: StatementsInput) {
  return requestWithAuth<unknown>({
    method: 'GET',
    path: '/statements',
    virtualAccount: resolveVirtualAccount(input.virtualAccount),
    query: {
      Inicio: input.inicio,
      Fim: input.fim,
      Tipo: input.tipo,
      'Paginacao.ItensPorPagina': input.itensPorPagina,
      'Paginacao.paginaAtual': input.paginaAtual,
    },
  })
}

export async function createCob(input: CreateCobInput, virtualAccount?: string | null) {
  return requestWithAuth<unknown>({
    method: 'POST',
    path: '/cob',
    virtualAccount: resolveVirtualAccount(virtualAccount),
    body: input,
  })
}

export async function getCobById(id: string, virtualAccount?: string | null) {
  const requestedVirtualAccount = resolveVirtualAccount(virtualAccount)
  const candidates = new Set<string>([requestedVirtualAccount])

  // Annapay may require querying the charge with the same virtual account used on creation.
  // If the caller sends a different account, retry with discovered accounts instead of failing hard.
  try {
    const accountsPayload = await listAccounts()
    const discovered = extractVirtualAccountCandidates(accountsPayload)
    discovered.forEach((account) => candidates.add(account))
  } catch {
    // Ignore account discovery failures and keep the primary attempt.
  }

  let lastError: unknown = null
  for (const account of candidates) {
    try {
      return await requestWithAuth<unknown>({
        method: 'GET',
        path: `/cob/${encodeURIComponent(id)}`,
        virtualAccount: account,
      })
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message.toLowerCase() : ''
      const isValidationError = message.includes('valida') || message.includes('validation')
      if (!isValidationError) {
        throw error
      }
    }
  }

  if (lastError) throw lastError

  return requestWithAuth<unknown>({
    method: 'GET',
    path: `/cob/${encodeURIComponent(id)}`,
    virtualAccount: requestedVirtualAccount,
  })
}

export async function createPix(input: CreatePixInput, virtualAccount?: string | null) {
  return requestWithAuth<unknown>({
    method: 'POST',
    path: '/pix',
    virtualAccount: resolveVirtualAccount(virtualAccount),
    body: input,
  })
}

export async function confirmPix(id: string, virtualAccount?: string | null) {
  const result = await requestWithAuth<unknown>({
    method: 'PUT',
    path: `/pix/${encodeURIComponent(id)}`,
    virtualAccount: resolveVirtualAccount(virtualAccount),
  })

  await prisma.$executeRaw`
    UPDATE "SessionFinancialPayoutPending"
    SET "status" = 'SENT', "updatedAt" = NOW()
    WHERE "payoutOrderId" = ${id}
  `

  return result
}

export async function testLogin() {
  const token = await login(true)
  return {
    authenticated: true,
    tokenExpiresAt: new Date(decodeJwtExpiration(token)).toISOString(),
  }
}

function normalizeFinancialModule(value: string | null | undefined): FinancialModuleValue {
  const normalized = String(value || '').toUpperCase()
  if (normalized === 'PREPAID') return 'PREPAID'
  if (normalized === 'HYBRID') return 'HYBRID'
  return 'POSTPAID'
}

function normalizeMemberPaymentMode(value: string | null | undefined): MemberPaymentModeValue {
  const normalized = String(value || '').toUpperCase()
  if (normalized === 'PREPAID') return 'PREPAID'
  if (normalized === 'POSTPAID') return 'POSTPAID'
  return null
}

function resolvePlayerMode(financialModule: FinancialModuleValue, memberMode: MemberPaymentModeValue): ResolvedPlayerMode {
  if (financialModule === 'POSTPAID') return 'POSTPAID'
  if (financialModule === 'PREPAID') return 'PREPAID'
  return memberMode === 'PREPAID' ? 'PREPAID' : 'POSTPAID'
}

function resolveCpfCnpjFromPix(input: { pixType: string | null; pixKey: string | null; cpf?: string | null }) {
  const digits = (input.pixKey || '').replace(/\D/g, '')
  const pixType = String(input.pixType || '').toUpperCase()
  const cpfDigits = (input.cpf || '').replace(/\D/g, '')

  if (pixType === 'CPF' && digits.length === 11) {
    return { cpf: digits, cnpj: null as string | null, cpfCnpj: digits }
  }

  if (pixType === 'CNPJ' && digits.length === 14) {
    return { cpf: null as string | null, cnpj: digits, cpfCnpj: digits }
  }

  if (cpfDigits.length === 11) {
    return { cpf: cpfDigits, cnpj: null as string | null, cpfCnpj: cpfDigits }
  }

  return { cpf: null as string | null, cnpj: null as string | null, cpfCnpj: null as string | null }
}

function isPrepaidSettledTransaction(note: string | null | undefined) {
  return typeof note === 'string' && note.includes('[charge:')
}

function amountToFixed(value: number) {
  return Number(value.toFixed(2))
}

function buildRakebackByUserId(params: {
  totalRake: number
  rakebackAssignments: Array<{ userId: string; percent?: unknown }>
}) {
  const totalRake = Number(params.totalRake || 0)
  const rakebackAssignments = Array.isArray(params.rakebackAssignments) ? params.rakebackAssignments : []

  if (totalRake <= 0 || rakebackAssignments.length === 0) return {} as Record<string, number>

  const percents = rakebackAssignments.map((assignment) => {
    const value = Number(assignment.percent || 0)
    return Number.isFinite(value) && value > 0 ? value : 0
  })

  if (percents.every((value) => value <= 0)) return {} as Record<string, number>

  const totalRakeCents = Math.round(totalRake * 100)
  const parts = rakebackAssignments.map((assignment, index) => {
    const percent = percents[index]
    const rawCents = totalRakeCents * (percent / 100)
    const cents = Math.floor(rawCents)
    return {
      userId: assignment.userId,
      cents,
      remainder: rawCents - cents,
    }
  })

  const targetCents = Math.round(totalRakeCents * (percents.reduce((sum, value) => sum + value, 0) / 100))
  let remaining = targetCents - parts.reduce((sum, item) => sum + item.cents, 0)

  if (remaining > 0) {
    const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder)
    let cursor = 0
    while (remaining > 0 && byRemainder.length > 0) {
      byRemainder[cursor % byRemainder.length].cents += 1
      remaining -= 1
      cursor += 1
    }
  }

  return parts.reduce<Record<string, number>>((acc, item) => {
    acc[item.userId] = amountToFixed(item.cents / 100)
    return acc
  }, {})
}

function flattenObjects(payload: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  const stack: unknown[] = [payload]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || typeof current !== 'object') continue

    if (Array.isArray(current)) {
      current.forEach((item) => stack.push(item))
      continue
    }

    const obj = current as Record<string, unknown>
    out.push(obj)
    Object.values(obj).forEach((value) => {
      if (value && typeof value === 'object') stack.push(value)
    })
  }

  return out
}

function extractNumericCandidates(obj: Record<string, unknown>): number[] {
  const values: number[] = []

  Object.values(obj).forEach((value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      values.push(value)
      return
    }

    if (typeof value === 'string') {
      const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')
      const parsed = Number(normalized)
      if (Number.isFinite(parsed) && normalized !== '') {
        values.push(parsed)
      }
    }
  })

  return values
}

function extractDateCandidate(obj: Record<string, unknown>): string | null {
  const candidates = [
    obj.horario,
    obj.data,
    obj.dataHora,
    obj.dataHoraPagamento,
    obj.paidAt,
    obj.createdAt,
    obj.updatedAt,
    obj.liquidadoEm,
  ]

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue
    const parsed = new Date(candidate)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }
  }

  return null
}

function findChargeInStatements(payload: unknown, chargeId: string, amount: number, debtorCpf?: string | null): { found: boolean; paidAt: string | null } {
  const targetCharge = chargeId.toLowerCase()
  const targetAmount = Number(amount.toFixed(2))
  const debtorCpfDigits = (debtorCpf || '').replace(/\D/g, '')

  const objects = flattenObjects(payload)
  for (const obj of objects) {
    const rawBlob = Object.values(obj)
      .filter((value) => typeof value === 'string')
      .join(' ')
    const textBlob = rawBlob.toLowerCase()
    const digitsBlob = rawBlob.replace(/\D/g, '')

    const paidAt = extractDateCandidate(obj)

    const hasChargeRef = textBlob.includes(targetCharge)
    if (hasChargeRef) return { found: true, paidAt }

    const numericCandidates = extractNumericCandidates(obj)
    const amountMatch = numericCandidates.some((value) => Math.abs(Number(value.toFixed(2)) - targetAmount) < 0.01)
    const looksCredit = textBlob.includes('credito') || textBlob.includes('crédito') || textBlob.includes('qrcode pago') || textBlob.includes('pix')
    const hasPaymentSignal = textBlob.includes('endtoendid') || textBlob.includes('e2eid') || textBlob.includes('receb') || textBlob.includes('liquid')
    const debtorMatch = debtorCpfDigits.length === 11 ? digitsBlob.includes(debtorCpfDigits) : false

    if (amountMatch && (looksCredit || hasPaymentSignal) && debtorMatch) {
      return { found: true, paidAt }
    }
  }

  return { found: false, paidAt: null }
}

function hasChargeInStatements(payload: unknown, chargeId: string, amount: number): boolean {
  return findChargeInStatements(payload, chargeId, amount).found
}

function extractPaidAtDeep(payload: unknown): string | null {
  const objects = flattenObjects(payload)
  for (const obj of objects) {
    const paidAt = extractDateCandidate(obj)
    if (paidAt) return paidAt
  }

  return null
}

function extractStatusDeep(payload: unknown): string | null {
  const stack: any[] = [payload]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || typeof current !== 'object') continue

    if (Array.isArray(current)) {
      current.forEach((item) => stack.push(item))
      continue
    }

    const status = typeof current.status === 'string' ? current.status.trim() : ''
    if (status) return status

    const situacao = typeof current.situacao === 'string' ? current.situacao.trim() : ''
    if (situacao) return situacao

    Object.values(current as Record<string, unknown>).forEach((value) => {
      if (value && typeof value === 'object') stack.push(value)
    })
  }

  return null
}

function payloadHasPixConfirmation(payload: unknown): boolean {
  const stack: any[] = [payload]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || typeof current !== 'object') continue

    if (Array.isArray(current)) {
      current.forEach((item) => stack.push(item))
      continue
    }

    const obj = current as Record<string, unknown>
    if (
      typeof obj.endToEndId === 'string' ||
      typeof obj.e2eId === 'string' ||
      typeof obj.horario === 'string'
    ) {
      return true
    }

    Object.values(obj).forEach((value) => {
      if (value && typeof value === 'object') stack.push(value)
    })
  }

  return false
}

function isPaidStatus(status: string | null): boolean {
  if (!status) return false
  const normalized = status.toLowerCase()
  return [
    'concluida',
    'concluída',
    'concluido',
    'concluído',
    'completa',
    'completo',
    'completed',
    'liquidada',
    'liquidado',
    'paga',
    'pago',
    'recebida',
    'recebido',
    'approved',
    'aprovada',
    'paid',
    'finalizada',
    'finalizado',
  ].some((token) => normalized.includes(token))
}

export async function checkPixChargeIsPaid(chargeId: string, virtualAccount?: string | null): Promise<{ paid: boolean; cobPayload?: unknown }> {
  try {
    const cobPayload = await getCobById(chargeId, virtualAccount)
    const status = extractStatusDeep(cobPayload)
    const paid = isPaidStatus(status) || payloadHasPixConfirmation(cobPayload)
    return { paid, cobPayload }
  } catch {
    return { paid: false }
  }
}

function getStringByPaths(payload: any, paths: string[][]): string | null {
  for (const path of paths) {
    let current: any = payload
    for (const key of path) {
      if (current == null) {
        current = undefined
        break
      }
      current = current[key]
    }

    if (typeof current === 'string' && current.trim()) {
      return current.trim()
    }
  }

  return null
}

function extractPixOrderId(payload: unknown): string | null {
  return getStringByPaths(payload as any, [
    ['id'],
    ['pixId'],
    ['orderId'],
    ['order_id'],
    ['data', 'id'],
    ['data', 'pixId'],
    ['response', 'id'],
    ['response', 'pixId'],
    ['result', 'id'],
  ])
}

function toDataImage(value: string | null): string | null {
  if (!value) return null
  if (value.startsWith('data:image')) return value

  const compact = value.replace(/\s+/g, '')
  if (/^[A-Za-z0-9+/=]+$/.test(compact) && compact.length > 60) {
    return `data:image/png;base64,${compact}`
  }

  return null
}

function normalizeCobPayload(payload: unknown): NormalizedCobResult {
  const source = payload as any
  // IMPORTANTE: Priorizar o ID próprio da Annapay ANTES de txid (que é um identificador PIX diferente)
  const id = getStringByPaths(source, [
    ['id'],
    ['ID'],
    ['cob', 'id'],
    ['data', 'id'],
    ['response', 'id'],
    ['created', 'id'],
    ['detailed', 'id'],
    ['loc', 'id'],
    ['pix', 'id'],
    // Fallback para txid se não encontrar id
    ['txid'],
    ['txId'],
    ['cob', 'txid'],
    ['cob', 'txId'],
    ['pix', 'txid'],
    ['pix', 'txId'],
    ['data', 'txid'],
    ['data', 'txId'],
    ['response', 'txid'],
    ['response', 'txId'],
    ['response', 'pix', 'txid'],
    ['response', 'pix', 'txId'],
    ['created', 'txid'],
    ['created', 'txId'],
    ['detailed', 'txid'],
    ['detailed', 'txId'],
  ])

  const pixCopyPaste = getStringByPaths(source, [
    ['pixCopiaECola'],
    ['pixCopiaecola'],
    ['pixCopyPaste'],
    ['copyPaste'],
    ['copiaECola'],
    ['links', 'emv'],
    ['pix', 'copiaECola'],
    ['pix', 'copiaecola'],
    ['qrcode', 'textoImagemQRcode'],
    ['qrcode', 'textoImagemQrcode'],
    ['qrcode', 'texto'],
    ['qrcode', 'payload'],
    ['data', 'pixCopiaECola'],
    ['response', 'pixCopiaECola'],
    ['created', 'pixCopiaECola'],
    ['detailed', 'pixCopiaECola'],
  ])

  const qrRaw = getStringByPaths(source, [
    ['qrCodeBase64'],
    ['qrcode'],
    ['pixQrCodeBase64'],
    ['links', 'qrCode'],
    ['qrcode', 'imagemQrcode'],
    ['qrcode', 'imagemQRCode'],
    ['data', 'qrcode'],
    ['response', 'qrcode'],
    ['created', 'qrcode'],
    ['detailed', 'qrcode'],
  ])

  const virtualAccount = getStringByPaths(source, [
    ['virtualAccount'],
    ['virtual_account'],
    ['conta', 'numero'],
    ['contaRecebedora', 'number'],
    ['data', 'virtualAccount'],
    ['created', 'virtualAccount'],
    ['detailed', 'virtualAccount'],
  ])

  return {
    id,
    pixCopyPaste,
    qrCodeBase64: toDataImage(qrRaw),
    virtualAccount,
    raw: payload,
  }
}

export async function createNormalizedCob(input: CreateCobInput, virtualAccount?: string | null): Promise<NormalizedCobResult> {
  const resolved = resolveVirtualAccount(virtualAccount)
  const created = await createCob(input, virtualAccount)
  const createdNormalized = normalizeCobPayload(created)

  if (createdNormalized.pixCopyPaste || createdNormalized.qrCodeBase64 || !createdNormalized.id) {
    return {
      ...createdNormalized,
      virtualAccount: resolved,
    }
  }

  try {
    const detailed = await getCobById(createdNormalized.id, virtualAccount)
    const merged = normalizeCobPayload({ created, detailed })
    return {
      id: merged.id || createdNormalized.id,
      pixCopyPaste: merged.pixCopyPaste,
      qrCodeBase64: merged.qrCodeBase64,
      virtualAccount: merged.virtualAccount || resolved,
      raw: { created, detailed },
    }
  } catch (error) {
    return {
      ...createdNormalized,
      virtualAccount: resolved,
      raw: {
        created,
        lookupError: error instanceof Error ? error.message : 'Falha ao consultar detalhe da cobrança',
      },
    }
  }
}

function extractVirtualAccountCandidates(payload: unknown): string[] {
  const result = new Set<string>()

  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return

    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }

    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)

    keys.forEach((key) => {
      const normalizedKey = key.toLowerCase()
      const current = obj[key]

      if (
        (normalizedKey.includes('virtual') && normalizedKey.includes('account')) ||
        normalizedKey === 'numero' ||
        normalizedKey === 'number' ||
        normalizedKey === 'accountnumber'
      ) {
        if (typeof current === 'string' && current.trim()) {
          result.add(current.trim())
        }
      }

      visit(current)
    })
  }

  visit(payload)
  return Array.from(result)
}

async function getSessionFinancialModule(sessionId: string): Promise<FinancialModuleValue> {
  const rows = await prisma.$queryRaw<Array<{ financialModule: string | null }>>`
    SELECT "financialModule"::text AS "financialModule"
    FROM "Session"
    WHERE "id" = ${sessionId}
    LIMIT 1
  `

  return normalizeFinancialModule(rows[0]?.financialModule)
}

async function getHomeGameMemberModes(homeGameId: string): Promise<Map<string, MemberPaymentModeValue>> {
  const rows = await prisma.$queryRaw<Array<{ userId: string; paymentMode: string | null }>>`
    SELECT "userId", "paymentMode"::text AS "paymentMode"
    FROM "HomeGameMember"
    WHERE "homeGameId" = ${homeGameId}
  `

  return new Map(rows.map((row) => [row.userId, normalizeMemberPaymentMode(row.paymentMode)]))
}

export async function generatePrepaidPurchaseCharge(input: {
  sessionId: string
  userId: string
  type: 'BUYIN' | 'REBUY' | 'ADDON'
  chips: number
  requestedBy: string
}) {
  if (input.chips <= 0) throw new Error('Quantidade de fichas deve ser maior que zero')

  const session = await prisma.session.findUniqueOrThrow({
    where: { id: input.sessionId },
    include: {
      homeGame: true,
      participantAssignments: { select: { userId: true } },
    },
  })

  const [member, user, financialModule] = await Promise.all([
    prisma.homeGameMember.findUnique({
      where: {
        homeGameId_userId: {
          homeGameId: session.homeGameId,
          userId: input.userId,
        },
      },
      select: { userId: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { id: true, name: true, cpf: true, pixType: true, pixKey: true },
    }),
    getSessionFinancialModule(session.id),
  ])

  if (!member) throw new Error('Jogador não é membro deste Home Game')

  const memberModes = await getHomeGameMemberModes(session.homeGameId)
  const playerMode = resolvePlayerMode(financialModule, memberModes.get(input.userId) || null)
  const chipValue = Number(session.chipValue ?? session.homeGame.chipValue)
  const amount = amountToFixed(input.chips * chipValue)

  if (playerMode !== 'PREPAID') {
    return {
      sessionId: input.sessionId,
      userId: input.userId,
      playerMode,
      requiresCharge: false,
      amount,
      message: 'Jogador em módulo pós-pago. Não é necessário gerar cobrança antecipada.',
    }
  }

  const debtor = resolveCpfCnpjFromPix({ pixType: user.pixType, pixKey: user.pixKey, cpf: user.cpf })
  if (!debtor.cpf && !debtor.cnpj) {
    throw new Error('No módulo pré-pago o jogador precisa ter CPF cadastrado ou chave PIX do tipo CPF/CNPJ para gerar cobrança')
  }

  const virtualAccount = resolveVirtualAccount()
  const charge = await createNormalizedCob({
    calendario: { expiracao: 3600 },
    devedor: {
      ...(debtor.cpf ? { cpf: debtor.cpf } : {}),
      ...(debtor.cnpj ? { cnpj: debtor.cnpj } : {}),
      nome: user.name,
    },
    valor: {
      original: amount.toFixed(2),
    },
    solicitacaoPagador: `StackPlus ${input.type} - Sessão ${session.id}`,
  }, virtualAccount)

  if (charge.id) {
    const pendingId = randomUUID()
    await prisma.$executeRaw`
      INSERT INTO "PrepaidChargePending" (
        "id",
        "chargeId",
        "sessionId",
        "userId",
        "virtualAccount",
        "type",
        "chips",
        "amount",
        "registeredBy",
        "status",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${pendingId},
        ${charge.id},
        ${input.sessionId},
        ${input.userId},
        ${virtualAccount},
        ${input.type}::"TransactionType",
        ${input.chips},
        ${amount},
        ${input.requestedBy},
        'PENDING',
        NOW(),
        NOW()
      )
      ON CONFLICT ("chargeId")
      DO UPDATE SET
        "sessionId" = EXCLUDED."sessionId",
        "userId" = EXCLUDED."userId",
        "virtualAccount" = EXCLUDED."virtualAccount",
        "type" = EXCLUDED."type",
        "chips" = EXCLUDED."chips",
        "amount" = EXCLUDED."amount",
        "registeredBy" = EXCLUDED."registeredBy",
        "status" = 'PENDING',
        "updatedAt" = NOW()
    `
  }

  return {
    sessionId: input.sessionId,
    userId: input.userId,
    playerMode,
    requiresCharge: true,
    amount,
    charge,
  }
}

export async function settlePrepaidChargeFromWebhook(payload: unknown) {
  const normalizedCob = normalizeCobPayload(payload)
  const chargeId = normalizedCob.id

  if (!chargeId) {
    return { processed: false, reason: 'missing-charge-id' as const }
  }

  const pendingRows = await prisma.$queryRaw<Array<PendingChargeRow>>`
    SELECT
      "chargeId",
      "sessionId",
      "userId",
      "virtualAccount",
      "type"::text AS "type",
      "chips"::text AS "chips",
      "amount"::text AS "amount",
      "registeredBy",
      "status"
    FROM "PrepaidChargePending"
    WHERE "chargeId" = ${chargeId}
    LIMIT 1
  `
  const pending = pendingRows[0]
  if (!pending) {
    return { processed: false, reason: 'pending-not-found' as const, chargeId }
  }

  if (pending.status === 'SETTLED') {
    return { processed: true, reason: 'already-settled' as const, chargeId, sessionId: pending.sessionId }
  }

  const status = extractStatusDeep(payload)
  const isPaid = isPaidStatus(status) || payloadHasPixConfirmation(payload)
  if (!isPaid) {
    return { processed: false, reason: 'not-paid' as const, chargeId, status }
  }

  try {
    const { registerTransaction } = await import('../cashier/cashier.service')
    const result = await registerTransaction({
      sessionId: pending.sessionId,
      userId: pending.userId,
      type: pending.type as TransactionType,
      amount: Number(pending.amount),
      chips: Number(pending.chips),
      note: `[charge:${chargeId}]`,
      registeredBy: pending.registeredBy,
    })

    await prisma.$executeRaw`
      UPDATE "PrepaidChargePending"
      SET "status" = 'SETTLED', "updatedAt" = NOW()
      WHERE "chargeId" = ${chargeId}
    `

    return {
      processed: true,
      reason: 'registered' as const,
      chargeId,
      status,
      sessionId: pending.sessionId,
      transactionResult: result,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao registrar transação do webhook'
    const normalized = message.toLowerCase()
    const alreadyRegistered = normalized.includes('buy-in já realizado') || normalized.includes('buy-in ja realizado')

    if (alreadyRegistered) {
      await prisma.$executeRaw`
        UPDATE "PrepaidChargePending"
        SET "status" = 'SETTLED', "updatedAt" = NOW()
        WHERE "chargeId" = ${chargeId}
      `
      return {
        processed: true,
        reason: 'already-registered' as const,
        chargeId,
        status,
        sessionId: pending.sessionId,
      }
    }

    throw error
  }
}

export async function settlePrepaidChargeById(chargeId: string, virtualAccount?: string | null) {
  const trimmedChargeId = chargeId.trim()
  if (!trimmedChargeId) {
    throw new Error('chargeId é obrigatório')
  }

  const pendingRows = await prisma.$queryRaw<Array<PendingChargeRow>>`
    SELECT
      "chargeId",
      "sessionId",
      "userId",
      "virtualAccount",
      "type"::text AS "type",
      "chips"::text AS "chips",
      "amount"::text AS "amount",
      "registeredBy",
      "status"
    FROM "PrepaidChargePending"
    WHERE "chargeId" = ${trimmedChargeId}
    LIMIT 1
  `

  const pending = pendingRows[0]
  if (!pending) {
    return {
      settled: false,
      reason: 'pending-not-found' as const,
      chargeId: trimmedChargeId,
      message: 'Cobrança pendente não encontrada no servidor.',
    }
  }

  const marker = `[charge:${trimmedChargeId}]`
  const existing = await prisma.transaction.findFirst({
    where: {
      sessionId: pending.sessionId,
      userId: pending.userId,
      type: pending.type as TransactionType,
      note: { contains: marker },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (existing) {
    await prisma.$executeRaw`
      UPDATE "PrepaidChargePending"
      SET "status" = 'SETTLED', "updatedAt" = NOW()
      WHERE "chargeId" = ${trimmedChargeId}
    `

    return {
      settled: true,
      reason: 'already-registered' as const,
      chargeId: trimmedChargeId,
      sessionId: pending.sessionId,
      message: 'Transação já registrada para esta cobrança.',
    }
  }

  let cobPayload: unknown
  const effectiveVirtualAccount = (virtualAccount?.trim() || pending.virtualAccount || null)
  try {
    cobPayload = await getCobById(trimmedChargeId, effectiveVirtualAccount)
  } catch {
    // Fallback: when cob lookup is unavailable, validate payment by statements history.
    try {
      const now = new Date()
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const statementsPayload = await getStatements({
        inicio: start.toISOString(),
        fim: now.toISOString(),
        itensPorPagina: 200,
        paginaAtual: 0,
        virtualAccount: effectiveVirtualAccount,
      })

      const foundInStatements = hasChargeInStatements(statementsPayload, trimmedChargeId, Number(pending.amount))
      if (foundInStatements) {
        const syntheticPayload = {
          id: trimmedChargeId,
          status: 'paid-by-statements',
          source: 'statements-fallback',
        }

        const settledFromStatements = await settlePrepaidChargeFromWebhook(syntheticPayload)
        if (settledFromStatements.processed) {
          return {
            settled: true,
            reason: settledFromStatements.reason,
            chargeId: trimmedChargeId,
            sessionId: settledFromStatements.sessionId,
            transactionResult: settledFromStatements.transactionResult,
            message: 'Pagamento confirmado por extrato e transação registrada.',
          }
        }
      }
    } catch {
      // Ignore fallback errors and return an availability message below.
    }

    return {
      settled: false,
      reason: 'status-unavailable' as const,
      chargeId: trimmedChargeId,
      sessionId: pending.sessionId,
      message: 'Status da Annapay indisponível no momento.',
    }
  }

  const settled = await settlePrepaidChargeFromWebhook(cobPayload)
  if (settled.processed) {
    return {
      settled: true,
      reason: settled.reason,
      chargeId: trimmedChargeId,
      sessionId: settled.sessionId,
      transactionResult: settled.transactionResult,
      message: 'Cobrança liquidada e registrada com sucesso.',
    }
  }

  return {
    settled: false,
    reason: settled.reason,
    chargeId: trimmedChargeId,
    sessionId: pending.sessionId,
    message: settled.reason === 'not-paid'
      ? `Pagamento ainda não identificado (status: ${settled.status || 'desconhecido'}).`
      : 'Pagamento ainda não identificado.',
  }
}

async function getSessionFinancialPendingCharge(sessionId: string, userId: string): Promise<SessionFinancialChargePendingRow | null> {
  const rows = await prisma.$queryRaw<Array<SessionFinancialChargePendingRow>>`
    SELECT
      "chargeId",
      "sessionId",
      "userId",
      "virtualAccount",
      "amount"::text AS "amount",
      "status",
      "updatedAt"::text AS "updatedAt"
    FROM "SessionFinancialChargePending"
    WHERE "sessionId" = ${sessionId} AND "userId" = ${userId}
    LIMIT 1
  `

  return rows[0] || null
}

async function upsertSessionFinancialPendingCharge(input: {
  chargeId: string
  sessionId: string
  userId: string
  virtualAccount: string
  amount: number
}) {
  const id = randomUUID()
  await prisma.$executeRaw`
    INSERT INTO "SessionFinancialChargePending" (
      "id",
      "chargeId",
      "sessionId",
      "userId",
      "virtualAccount",
      "amount",
      "status",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${id},
      ${input.chargeId},
      ${input.sessionId},
      ${input.userId},
      ${input.virtualAccount},
      ${input.amount},
      'PENDING',
      NOW(),
      NOW()
    )
    ON CONFLICT ("sessionId", "userId")
    DO UPDATE SET
      "chargeId" = EXCLUDED."chargeId",
      "virtualAccount" = EXCLUDED."virtualAccount",
      "amount" = EXCLUDED."amount",
      "status" = 'PENDING',
      "updatedAt" = NOW()
  `
}

async function markSessionFinancialChargeAsSettled(sessionId: string, userId: string) {
  await prisma.$executeRaw`
    UPDATE "SessionFinancialChargePending"
    SET "status" = 'SETTLED', "updatedAt" = NOW()
    WHERE "sessionId" = ${sessionId} AND "userId" = ${userId}
  `
}

async function markSessionFinancialChargeAsPending(sessionId: string, userId: string) {
  await prisma.$executeRaw`
    UPDATE "SessionFinancialChargePending"
    SET "status" = 'PENDING', "updatedAt" = NOW()
    WHERE "sessionId" = ${sessionId} AND "userId" = ${userId}
  `
}

async function getSessionFinancialPendingPayout(sessionId: string, userId: string, purpose: PayoutPurposeValue): Promise<SessionFinancialPayoutPendingRow | null> {
  const rows = await prisma.$queryRaw<Array<SessionFinancialPayoutPendingRow>>`
    SELECT
      "sessionId",
      "userId",
      "purpose"::text AS "purpose",
      "payoutOrderId",
      "virtualAccount",
      "amount"::text AS "amount",
      "status",
      "updatedAt"::text AS "updatedAt"
    FROM "SessionFinancialPayoutPending"
    WHERE "sessionId" = ${sessionId}
      AND "userId" = ${userId}
      AND "purpose" = ${purpose}::"SessionFinancialPayoutPurpose"
    LIMIT 1
  `

  return rows[0] || null
}

async function upsertSessionFinancialPendingPayout(input: {
  sessionId: string
  userId: string
  purpose: PayoutPurposeValue
  payoutOrderId: string
  virtualAccount: string
  amount: number
}) {
  const id = randomUUID()
  await prisma.$executeRaw`
    INSERT INTO "SessionFinancialPayoutPending" (
      "id",
      "sessionId",
      "userId",
      "purpose",
      "payoutOrderId",
      "virtualAccount",
      "amount",
      "status",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${id},
      ${input.sessionId},
      ${input.userId},
      ${input.purpose}::"SessionFinancialPayoutPurpose",
      ${input.payoutOrderId},
      ${input.virtualAccount},
      ${input.amount},
      'PENDING',
      NOW(),
      NOW()
    )
    ON CONFLICT ("sessionId", "userId", "purpose")
    DO UPDATE SET
      "payoutOrderId" = EXCLUDED."payoutOrderId",
      "virtualAccount" = EXCLUDED."virtualAccount",
      "amount" = EXCLUDED."amount",
      "status" = 'PENDING',
      "updatedAt" = NOW()
  `
}

async function resolveSessionFinancialChargeStatus(input: {
  chargeId: string
  amount: number
  virtualAccount: string
  debtorCpf?: string | null
}): Promise<{ paid: boolean; normalizedCharge: NormalizedCobResult | null; paidAt: string | null }> {
  try {
    // Strict lookup on the exact virtual account avoids cross-account false positives.
    const payload = await requestWithAuth<unknown>({
      method: 'GET',
      path: `/cob/${encodeURIComponent(input.chargeId)}`,
      virtualAccount: input.virtualAccount,
    })
    const status = extractStatusDeep(payload)
    const normalized = normalizeCobPayload(payload)
    const sameCharge = normalized.id ? normalized.id.trim().toLowerCase() === input.chargeId.trim().toLowerCase() : false
    const paidByCob = sameCharge && (isPaidStatus(status) || payloadHasPixConfirmation(payload))
    if (paidByCob) {
      return { paid: true, normalizedCharge: normalizeCobPayload(payload), paidAt: extractPaidAtDeep(payload) }
    }

    return { paid: false, normalizedCharge: normalizeCobPayload(payload), paidAt: null }
  } catch {
    return {
      paid: false,
      normalizedCharge: null,
      paidAt: null,
    }
  }
}

export async function generateSessionFinancialReport(sessionId: string, hostId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      homeGame: true,
      transactions: {
        select: {
          userId: true,
          type: true,
          amount: true,
          note: true,
        },
      },
      playerStates: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              cpf: true,
              pixType: true,
              pixKey: true,
            },
          },
        },
      },
      staffAssignments: {
        select: {
          userId: true,
          caixinhaAmount: true,
          user: {
            select: {
              id: true,
              name: true,
              cpf: true,
              pixType: true,
              pixKey: true,
            },
          },
        },
      },
      rakebackAssignments: {
        select: {
          userId: true,
          percent: true,
        },
      },
    },
  })

  if (!(await isHomeGameHost(hostId, session.homeGameId))) throw new Error('Acesso negado')
  if (session.status !== 'FINISHED') throw new Error('A sessão precisa estar finalizada para gerar o relatório financeiro')

  const virtualAccount = resolveVirtualAccount()
  const financialModule = await getSessionFinancialModule(session.id)
  const rakebackByUserId = buildRakebackByUserId({
    totalRake: Number(session.rake || 0),
    rakebackAssignments: session.rakebackAssignments,
  })

  const totalCaixinha = Number(session.caixinha || 0)
  const staffUserIds = session.staffAssignments.map((s) => s.userId)
  const caixinhaMode = (session as unknown as { caixinhaMode?: string }).caixinhaMode === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'SPLIT'
  const caixinhaByUser = new Map<string, number>()
  if (staffUserIds.length > 0) {
    if (caixinhaMode === 'INDIVIDUAL') {
      for (const staff of session.staffAssignments) {
        const amount = Number((staff as unknown as { caixinhaAmount?: unknown }).caixinhaAmount || 0)
        caixinhaByUser.set(staff.userId, amountToFixed(amount))
      }
    } else if (totalCaixinha > 0) {
      const perStaff = amountToFixed(Math.floor(Math.round(totalCaixinha * 100) / staffUserIds.length) / 100)
      for (const userId of staffUserIds) {
        caixinhaByUser.set(userId, perStaff)
      }
    }
  }
  const caixinhaRecipientsProcessed = new Set<string>()

  const charges: Array<{ userId: string; name: string; amount: number; mode: ResolvedPlayerMode; charge?: unknown; skippedReason?: string }> = []
  const payouts: Array<{ userId: string; name: string; amount: number; mode: ResolvedPlayerMode; payoutOrder?: unknown; skippedReason?: string }> = []
  const receivedPayments: Array<{ userId: string; name: string; amount: number; paidAt: string }> = []
  const sentPayouts: Array<{ userId: string; name: string; amount: number; sentAt: string }> = []

  async function pushPayout(params: {
    userId: string
    name: string
    cpf?: string | null
    pixType: string | null
    pixKey: string | null
    amount: number
    purpose: PayoutPurposeValue
    mode: ResolvedPlayerMode
    skippedReason: string
    description: string
  }) {
    const existingPayout = await getSessionFinancialPendingPayout(session.id, params.userId, params.purpose)
    if (existingPayout) {
      const sameAmount = amountToFixed(Number(existingPayout.amount)) === params.amount
      if (sameAmount && existingPayout.status === 'SENT') {
        sentPayouts.push({
          userId: params.userId,
          name: params.name,
          amount: params.amount,
          sentAt: existingPayout.updatedAt,
        })
        return
      }

      if (sameAmount && existingPayout.status !== 'SENT') {
        payouts.push({
          userId: params.userId,
          name: params.name,
          amount: params.amount,
          mode: params.mode,
          payoutOrder: { id: existingPayout.payoutOrderId },
        })
        return
      }
    }

    const recipientCpfCnpj = resolveCpfCnpjFromPix({ pixType: params.pixType, pixKey: params.pixKey, cpf: params.cpf }).cpfCnpj
    if (!params.pixKey || !recipientCpfCnpj) {
      payouts.push({
        userId: params.userId,
        name: params.name,
        amount: params.amount,
        mode: params.mode,
        skippedReason: params.skippedReason,
      })
      return
    }

    const payoutOrder = await createPix({
      valor: params.amount,
      descricao: params.description,
      destinatario: {
        tipo: 'CHAVE',
        chave: params.pixKey,
        cpfCnpjRecebedor: recipientCpfCnpj,
      },
    }, virtualAccount)

    payouts.push({
      userId: params.userId,
      name: params.name,
      amount: params.amount,
      mode: params.mode,
      payoutOrder,
    })

    const payoutOrderId = extractPixOrderId(payoutOrder)
    if (payoutOrderId) {
      await upsertSessionFinancialPendingPayout({
        sessionId: session.id,
        userId: params.userId,
        purpose: params.purpose,
        payoutOrderId,
        virtualAccount,
        amount: params.amount,
      })
    }
  }

  for (const player of session.playerStates) {
    const playerTransactions = session.transactions.filter((transaction) => transaction.userId === player.userId)
    const purchaseTransactions = playerTransactions.filter((transaction) => (
      transaction.type === 'BUYIN' || transaction.type === 'REBUY' || transaction.type === 'ADDON'
    ))
    const postpaidOpenAmount = amountToFixed(purchaseTransactions.reduce((sum, transaction) => {
      if (isPrepaidSettledTransaction(transaction.note)) return sum
      return sum + Number(transaction.amount)
    }, 0))
    const chipsOut = amountToFixed(Number(player.chipsOut))
    const playerCaixinha = caixinhaByUser.get(player.userId) ?? 0
    const playerRakeback = amountToFixed(Number(rakebackByUserId[player.userId] || 0))
    const settlementBalance = amountToFixed(chipsOut - postpaidOpenAmount + playerRakeback)
    // Net final balance per player: settlement +/- caixinha.
    // This prevents the same player from appearing in both charge and payout lists.
    const netBalance = amountToFixed(settlementBalance + playerCaixinha)
    const mode: ResolvedPlayerMode = postpaidOpenAmount > 0 ? 'POSTPAID' : 'PREPAID'

    if (playerCaixinha > 0) {
      caixinhaRecipientsProcessed.add(player.userId)
    }

    // Purchases already settled via prepaid charges stay frozen and are not billed again.
    // Only postpaid purchases remain open for final settlement, and cashout offsets them first.
    if (netBalance > 0) {
      await pushPayout({
        userId: player.userId,
        name: player.user.name,
        cpf: player.user.cpf,
        pixType: player.user.pixType,
        pixKey: player.user.pixKey,
        amount: netBalance,
        purpose: 'SETTLEMENT',
        mode,
        skippedReason: 'Jogador sem dados PIX completos para criar ordem de pagamento',
        description: `Liquidação StackPlus - Sessão ${session.id}`,
      })
    }

    if (netBalance < 0) {
      const amount = amountToFixed(Math.abs(netBalance))
      const debtor = resolveCpfCnpjFromPix({ pixType: player.user.pixType, pixKey: player.user.pixKey, cpf: player.user.cpf })
      if (!debtor.cpf && !debtor.cnpj) {
        charges.push({
          userId: player.userId,
          name: player.user.name,
          amount,
          mode,
          skippedReason: 'Jogador sem CPF cadastrado ou chave PIX CPF/CNPJ para cobrança automática',
        })
      } else {
        let charge: NormalizedCobResult | null = null
        const pendingCharge = await getSessionFinancialPendingCharge(session.id, player.userId)

        if (pendingCharge?.status === 'SETTLED') {
          if (pendingCharge.chargeId) {
            const statusCheck = await resolveSessionFinancialChargeStatus({
              chargeId: pendingCharge.chargeId,
              amount: amountToFixed(Number(pendingCharge.amount)),
              virtualAccount: pendingCharge.virtualAccount || virtualAccount,
              debtorCpf: player.user.cpf,
            })

            if (statusCheck.paid) {
              receivedPayments.push({
                userId: player.userId,
                name: player.user.name,
                amount: amountToFixed(Number(pendingCharge.amount)),
                paidAt: statusCheck.paidAt || pendingCharge.updatedAt,
              })
              continue
            }

            await markSessionFinancialChargeAsPending(session.id, player.userId)
          }
        }

        if (pendingCharge?.status !== 'SETTLED' && pendingCharge?.chargeId) {
          const pendingAmount = amountToFixed(Number(pendingCharge.amount))
          const sameAmount = pendingAmount === amount

          if (sameAmount) {
            const statusCheck = await resolveSessionFinancialChargeStatus({
              chargeId: pendingCharge.chargeId,
              amount,
              virtualAccount: pendingCharge.virtualAccount || virtualAccount,
              debtorCpf: player.user.cpf,
            })

            if (statusCheck.paid) {
              await markSessionFinancialChargeAsSettled(session.id, player.userId)
              receivedPayments.push({
                userId: player.userId,
                name: player.user.name,
                amount,
                paidAt: statusCheck.paidAt || new Date().toISOString(),
              })
              continue
            }

            charge = statusCheck.normalizedCharge
          }
        }

        if (!charge) {
          charge = await createNormalizedCob({
            calendario: { expiracao: 86400 },
            devedor: {
              ...(debtor.cpf ? { cpf: debtor.cpf } : {}),
              ...(debtor.cnpj ? { cnpj: debtor.cnpj } : {}),
              nome: player.user.name,
            },
            valor: {
              original: amount.toFixed(2),
            },
            solicitacaoPagador: `Liquidação StackPlus - Sessão ${session.id}`,
          }, virtualAccount)

          if (charge.id) {
            await upsertSessionFinancialPendingCharge({
              chargeId: charge.id,
              sessionId: session.id,
              userId: player.userId,
              virtualAccount,
              amount,
            })
          }
        }

        charges.push({
          userId: player.userId,
          name: player.user.name,
          amount,
          mode,
          charge,
        })
      }
    }
  }

  // Staff outside playerStates must also receive their caixinha share.
  for (const staff of session.staffAssignments) {
    if (caixinhaRecipientsProcessed.has(staff.userId)) continue
    const amount = caixinhaByUser.get(staff.userId) ?? 0
    if (amount <= 0) continue

    await pushPayout({
      userId: staff.userId,
      name: staff.user.name,
      cpf: staff.user.cpf,
      pixType: staff.user.pixType,
      pixKey: staff.user.pixKey,
      amount,
      purpose: 'CAIXINHA',
      mode: 'PREPAID',
      skippedReason: 'Staff sem dados PIX completos para pagamento da caixinha',
      description: `Caixinha StackPlus - Sessão ${session.id}`,
    })
  }

  // Reconciliação bancária: cruza cobranças confirmadas com extrato do Annapay
  const reconciliation = await buildManualConfirmationsReconciliation(
    session.id,
    session.startedAt?.toISOString() ?? session.createdAt.toISOString(),
    session.finishedAt?.toISOString() ?? new Date().toISOString(),
    virtualAccount,
  )

  return {
    sessionId: session.id,
    homeGameId: session.homeGameId,
    financialModule,
    generatedAt: new Date().toISOString(),
    summary: {
      chargesCreated: charges.filter((item) => !item.skippedReason && item.charge).length,
      chargesSkipped: charges.filter((item) => item.skippedReason).length,
      receivedPayments: receivedPayments.length,
      payoutsSent: sentPayouts.length,
      payoutsCreatedPendingApproval: payouts.filter((item) => !item.skippedReason && item.payoutOrder).length,
      payoutsSkipped: payouts.filter((item) => item.skippedReason).length,
    },
    charges,
    receivedPayments,
    sentPayouts,
    payouts,
    reconciliation,
  }
}

// ─── Conciliação Bancária ──────────────────────────────────────────────────────

export interface ReconciliationItem {
  chargeId: string
  flow: 'PREPAID_PURCHASE' | 'SESSION_SETTLEMENT'
  userId: string
  playerName: string
  amount: number
  settledAt: string
  matchStatus: 'FOUND' | 'NOT_FOUND'
  endToEndId: string | null
  matchedAt: string | null
}

interface PrepaidSettledRow {
  chargeId: string
  userId: string
  amount: string
  updatedAt: string
}

interface SessionSettledRow {
  chargeId: string
  userId: string
  amount: string
  updatedAt: string
}

async function buildManualConfirmationsReconciliation(
  sessionId: string,
  startIso: string,
  endIso: string,
  virtualAccount: string,
): Promise<{
  items: ReconciliationItem[]
  totalFound: number
  totalNotFound: number
  countFound: number
  countNotFound: number
}> {
  try {
    // 1. Busca cobranças pré-pagas liquidadas (buy-in/rebuy/addon durante a partida)
    const prepaidRows = await prisma.$queryRaw<PrepaidSettledRow[]>`
      SELECT "chargeId", "userId", "amount"::text AS "amount", "updatedAt"::text AS "updatedAt"
      FROM "PrepaidChargePending"
      WHERE "sessionId" = ${sessionId}
        AND "status" = 'SETTLED'
    `

    // 2. Busca cobranças de liquidação final liquidadas (fechamento da sessão)
    const sessionRows = await prisma.$queryRaw<SessionSettledRow[]>`
      SELECT "chargeId", "userId", "amount"::text AS "amount", "updatedAt"::text AS "updatedAt"
      FROM "SessionFinancialChargePending"
      WHERE "sessionId" = ${sessionId}
        AND "status" = 'SETTLED'
    `

    const allRows = [
      ...prepaidRows.map((r) => ({ ...r, flow: 'PREPAID_PURCHASE' as const })),
      ...sessionRows.map((r) => ({ ...r, flow: 'SESSION_SETTLEMENT' as const })),
    ]

    if (allRows.length === 0) {
      return { items: [], totalFound: 0, totalNotFound: 0, countFound: 0, countNotFound: 0 }
    }

    // 3. Busca os CPFs dos jogadores envolvidos
    const userIds = Array.from(new Set(allRows.map((r) => r.userId)))
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, cpf: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    // 4. Busca extrato Annapay para o período da sessão (máx 200 itens, paginação única)
    let statementsPayload: unknown = null
    try {
      statementsPayload = await getStatements({
        inicio: startIso,
        fim: endIso,
        itensPorPagina: 200,
        paginaAtual: 0,
        virtualAccount,
      })
    } catch {
      // Extrato indisponível: todas as entradas ficam como NOT_FOUND mas sem falha fatal
    }

    // 5. Cruza cada cobrança com o extrato
    const items: ReconciliationItem[] = []
    let totalFound = 0
    let totalNotFound = 0
    let countFound = 0
    let countNotFound = 0

    for (const row of allRows) {
      const user = userMap.get(row.userId)
      const amount = Number(row.amount)
      const playerName = user?.name ?? row.userId
      const debtorCpf = user?.cpf ?? null

      let matchStatus: 'FOUND' | 'NOT_FOUND' = 'NOT_FOUND'
      let endToEndId: string | null = null
      let matchedAt: string | null = null

      if (statementsPayload) {
        const result = findChargeInStatements(statementsPayload, row.chargeId, amount, debtorCpf)
        if (result.found) {
          matchStatus = 'FOUND'
          matchedAt = result.paidAt
          // Extrai endToEndId do objeto que fez match
          endToEndId = extractEndToEndId(statementsPayload, row.chargeId, amount, debtorCpf)
        }
      }

      items.push({
        chargeId: row.chargeId,
        flow: row.flow,
        userId: row.userId,
        playerName,
        amount,
        settledAt: row.updatedAt,
        matchStatus,
        endToEndId,
        matchedAt,
      })

      if (matchStatus === 'FOUND') {
        countFound++
        totalFound += amount
      } else {
        countNotFound++
        totalNotFound += amount
      }
    }

    return {
      items,
      totalFound: Number(totalFound.toFixed(2)),
      totalNotFound: Number(totalNotFound.toFixed(2)),
      countFound,
      countNotFound,
    }
  } catch {
    // Não deixa a conciliação derrubar o relatório inteiro
    return { items: [], totalFound: 0, totalNotFound: 0, countFound: 0, countNotFound: 0 }
  }
}

function extractEndToEndId(payload: unknown, chargeId: string, amount: number, debtorCpf?: string | null): string | null {
  const targetCharge = chargeId.toLowerCase()
  const targetAmount = Number(amount.toFixed(2))
  const debtorCpfDigits = (debtorCpf || '').replace(/\D/g, '')

  const objects = flattenObjects(payload)
  for (const obj of objects) {
    const rawBlob = Object.values(obj).filter((v) => typeof v === 'string').join(' ')
    const textBlob = rawBlob.toLowerCase()
    const digitsBlob = rawBlob.replace(/\D/g, '')

    const hasChargeRef = textBlob.includes(targetCharge)
    const numericCandidates = extractNumericCandidates(obj)
    const amountMatch = numericCandidates.some((v) => Math.abs(Number(v.toFixed(2)) - targetAmount) < 0.01)
    const debtorMatch = debtorCpfDigits.length === 11 ? digitsBlob.includes(debtorCpfDigits) : false

    if (hasChargeRef || (amountMatch && debtorMatch)) {
      const e2e = typeof obj.endToEndId === 'string' ? obj.endToEndId
        : typeof obj.e2eId === 'string' ? obj.e2eId
        : null
      if (e2e) return e2e
    }
  }
  return null
}
