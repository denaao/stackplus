import { prisma } from '../../lib/prisma'

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

type PendingPrepaidCharge = {
  chargeId: string
  sessionId: string
  userId: string
  type: 'BUYIN' | 'REBUY' | 'ADDON'
  chips: number
  amount: number
  registeredBy: string
  createdAt: number
}

type AnnapayConfig = {
  baseUrl: string
  clientID: string
  clientSecret: string
  defaultVirtualAccount: string | null
}

type AnnapayWebhookUpsertInput = {
  url: string
  pix: boolean
  secret?: string
}

let tokenCache: AnnapayTokenCache | null = null
const pendingPrepaidCharges = new Map<string, PendingPrepaidCharge>()

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

  const message = data.message || data.error || data.details
  if (typeof message === 'string' && message.trim()) return message

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

  try {
    return await requestWithAuth<unknown>({
      method: 'PUT',
      path: '/webhook',
      virtualAccount: resolvedVirtualAccount,
      body: input,
    })
  } catch {
    return requestWithAuth<unknown>({
      method: 'POST',
      path: '/webhook',
      virtualAccount: resolvedVirtualAccount,
      body: input,
    })
  }
}

export async function syncCobWebhookConfig(virtualAccount?: string | null) {
  const secret = process.env.ANNAPAY_WEBHOOK_SECRET?.trim()
  const payload: AnnapayWebhookUpsertInput = {
    url: buildWebhookTargetUrl(),
    pix: true,
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

export async function createPix(input: CreatePixInput) {
  return requestWithAuth<unknown>({
    method: 'POST',
    path: '/pix',
    body: input,
  })
}

export async function confirmPix(id: string) {
  return requestWithAuth<unknown>({
    method: 'PUT',
    path: `/pix/${encodeURIComponent(id)}`,
  })
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

function resolveCpfCnpjFromPix(input: { pixType: string | null; pixKey: string | null }) {
  const digits = (input.pixKey || '').replace(/\D/g, '')
  const pixType = String(input.pixType || '').toUpperCase()

  if (pixType === 'CPF' && digits.length === 11) {
    return { cpf: digits, cnpj: null as string | null, cpfCnpj: digits }
  }

  if (pixType === 'CNPJ' && digits.length === 14) {
    return { cpf: null as string | null, cnpj: digits, cpfCnpj: digits }
  }

  return { cpf: null as string | null, cnpj: null as string | null, cpfCnpj: null as string | null }
}

function amountToFixed(value: number) {
  return Number(value.toFixed(2))
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
    'liquidada',
    'liquidado',
    'paga',
    'pago',
    'recebida',
    'recebido',
    'approved',
    'aprovada',
    'paid',
  ].some((token) => normalized.includes(token))
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
  const id = getStringByPaths(source, [
    ['txid'],
    ['txId'],
    ['id'],
    ['cob', 'id'],
    ['cob', 'txid'],
    ['cob', 'txId'],
    ['pix', 'txid'],
    ['pix', 'txId'],
    ['pix', 'id'],
    ['data', 'id'],
    ['data', 'txid'],
    ['data', 'txId'],
    ['response', 'id'],
    ['response', 'txid'],
    ['response', 'txId'],
    ['response', 'pix', 'txid'],
    ['response', 'pix', 'txId'],
    ['loc', 'id'],
    ['created', 'id'],
    ['created', 'txid'],
    ['created', 'txId'],
    ['detailed', 'id'],
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

async function createNormalizedCob(input: CreateCobInput, virtualAccount?: string | null): Promise<NormalizedCobResult> {
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

async function getHomeGameFinancialModule(homeGameId: string): Promise<FinancialModuleValue> {
  const rows = await prisma.$queryRaw<Array<{ financialModule: string | null }>>`
    SELECT "financialModule"::text AS "financialModule"
    FROM "HomeGame"
    WHERE "id" = ${homeGameId}
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
      select: { id: true, name: true, pixType: true, pixKey: true },
    }),
    getHomeGameFinancialModule(session.homeGameId),
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

  const debtor = resolveCpfCnpjFromPix({ pixType: user.pixType, pixKey: user.pixKey })
  if (!debtor.cpf && !debtor.cnpj) {
    throw new Error('No módulo pré-pago o jogador precisa ter chave PIX do tipo CPF ou CNPJ para gerar cobrança')
  }

  const virtualAccount = resolveVirtualAccount()
  const charge = await createNormalizedCob({
    calendario: { expiracao: 3600 },
    devedor: {
      cpf: debtor.cpf,
      cnpj: debtor.cnpj,
      nome: user.name,
    },
    valor: {
      original: amount.toFixed(2),
    },
    solicitacaoPagador: `StackPlus ${input.type} - Sessão ${session.id}`,
  }, virtualAccount)

  if (charge.id) {
    pendingPrepaidCharges.set(charge.id, {
      chargeId: charge.id,
      sessionId: input.sessionId,
      userId: input.userId,
      type: input.type,
      chips: input.chips,
      amount,
      registeredBy: input.requestedBy,
      createdAt: Date.now(),
    })
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

  const pending = pendingPrepaidCharges.get(chargeId)
  if (!pending) {
    return { processed: false, reason: 'pending-not-found' as const, chargeId }
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
      type: pending.type,
      amount: pending.amount,
      chips: pending.chips,
      registeredBy: pending.registeredBy,
    })

    pendingPrepaidCharges.delete(chargeId)

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
      pendingPrepaidCharges.delete(chargeId)
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

export async function generateSessionFinancialReport(sessionId: string, hostId: string) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      homeGame: true,
      playerStates: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              pixType: true,
              pixKey: true,
            },
          },
        },
      },
    },
  })

  if (session.homeGame.hostId !== hostId) throw new Error('Acesso negado')
  if (session.status !== 'FINISHED') throw new Error('A sessão precisa estar finalizada para gerar o relatório financeiro')

  const virtualAccount = resolveVirtualAccount()
  const [financialModule, memberMap] = await Promise.all([
    getHomeGameFinancialModule(session.homeGameId),
    getHomeGameMemberModes(session.homeGameId),
  ])

  const charges: Array<{ userId: string; name: string; amount: number; mode: ResolvedPlayerMode; charge?: unknown; skippedReason?: string }> = []
  const payouts: Array<{ userId: string; name: string; amount: number; mode: ResolvedPlayerMode; payoutOrder?: unknown; skippedReason?: string }> = []

  for (const player of session.playerStates) {
    const result = Number(player.result)
    const mode = resolvePlayerMode(financialModule, memberMap.get(player.userId) || null)

    if (result < 0 && mode === 'POSTPAID') {
      const amount = amountToFixed(Math.abs(result))
      const debtor = resolveCpfCnpjFromPix({ pixType: player.user.pixType, pixKey: player.user.pixKey })
      if (!debtor.cpf && !debtor.cnpj) {
        charges.push({
          userId: player.userId,
          name: player.user.name,
          amount,
          mode,
          skippedReason: 'Jogador sem PIX do tipo CPF/CNPJ para cobrança automática',
        })
      } else {
        const charge = await createNormalizedCob({
          calendario: { expiracao: 86400 },
          devedor: {
            cpf: debtor.cpf,
            cnpj: debtor.cnpj,
            nome: player.user.name,
          },
          valor: {
            original: amount.toFixed(2),
          },
          solicitacaoPagador: `Liquidação StackPlus - Sessão ${session.id}`,
        }, virtualAccount)

        charges.push({
          userId: player.userId,
          name: player.user.name,
          amount,
          mode,
          charge,
        })
      }
      continue
    }

    if (result > 0) {
      const amount = amountToFixed(result)
      const recipientCpfCnpj = resolveCpfCnpjFromPix({ pixType: player.user.pixType, pixKey: player.user.pixKey }).cpfCnpj
      if (!player.user.pixKey || !recipientCpfCnpj) {
        payouts.push({
          userId: player.userId,
          name: player.user.name,
          amount,
          mode,
          skippedReason: 'Jogador sem dados PIX completos para criar ordem de pagamento',
        })
      } else {
        const payoutOrder = await createPix({
          valor: amount,
          descricao: `Liquidação StackPlus - Sessão ${session.id}`,
          destinatario: {
            tipo: 'CHAVE',
            chave: player.user.pixKey,
            cpfCnpjRecebedor: recipientCpfCnpj,
          },
        })

        payouts.push({
          userId: player.userId,
          name: player.user.name,
          amount,
          mode,
          payoutOrder,
        })
      }
    }
  }

  return {
    sessionId: session.id,
    homeGameId: session.homeGameId,
    financialModule,
    generatedAt: new Date().toISOString(),
    summary: {
      chargesCreated: charges.filter((item) => !item.skippedReason && item.charge).length,
      chargesSkipped: charges.filter((item) => item.skippedReason).length,
      payoutsCreatedPendingApproval: payouts.filter((item) => !item.skippedReason && item.payoutOrder).length,
      payoutsSkipped: payouts.filter((item) => item.skippedReason).length,
    },
    charges,
    payouts,
  }
}
