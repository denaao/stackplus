import { prisma } from '../../lib/prisma'

type EvolutionEnvConfig = {
  apiUrl: string
  apiKey: string
  defaultInstanceName: string
  publicApiUrl: string
  webhookSecret: string | null
  autoNotifySessionFinish: boolean
}

type SendTextResult = {
  logId: string
  response: unknown
}

const DEFAULT_WEBHOOK_EVENTS = [
  'QRCODE_UPDATED',
  'CONNECTION_UPDATE',
  'MESSAGES_UPSERT',
  'SEND_MESSAGE',
  'SEND_MESSAGE_UPDATE',
]

function getEnvConfig(): EvolutionEnvConfig {
  const apiUrl = process.env.EVOLUTION_API_URL?.trim()
  const apiKey = process.env.EVOLUTION_API_KEY?.trim()
  const defaultInstanceName = process.env.EVOLUTION_INSTANCE_NAME?.trim() || 'stackplus-main'
  const publicApiUrl = process.env.API_PUBLIC_URL?.trim()
  const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET?.trim() || null
  const autoNotifySessionFinish = process.env.EVOLUTION_AUTO_NOTIFY_SESSION_FINISH === 'true'

  if (!apiUrl) throw new Error('Evolution API não configurada: EVOLUTION_API_URL ausente')
  if (!apiKey) throw new Error('Evolution API não configurada: EVOLUTION_API_KEY ausente')
  if (!publicApiUrl) throw new Error('Evolution API não configurada: API_PUBLIC_URL ausente')

  return {
    apiUrl: apiUrl.replace(/\/+$/, ''),
    apiKey,
    defaultInstanceName,
    publicApiUrl: publicApiUrl.replace(/\/+$/, ''),
    webhookSecret,
    autoNotifySessionFinish,
  }
}

function buildHostInstanceName(hostId: string) {
  const normalizedHostId = String(hostId || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (!normalizedHostId) throw new Error('Host inválido para resolver instância WhatsApp')
  return `stackplus-host-${normalizedHostId}`
}

function resolveInstanceName(options?: { hostId?: string; instanceName?: string | null }) {
  if (options?.instanceName?.trim()) return options.instanceName.trim()
  if (options?.hostId?.trim()) return buildHostInstanceName(options.hostId)

  const config = getEnvConfig()
  return config.defaultInstanceName
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function webhookUrl(config: EvolutionEnvConfig) {
  return `${config.publicApiUrl}/api/whatsapp/evolution/webhook`
}

function extractJson(text: string) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function evolutionRequest(path: string, init?: RequestInit) {
  const config = getEnvConfig()
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: config.apiKey,
      ...(init?.headers || {}),
    },
  })

  const raw = await response.text()
  const data = extractJson(raw)

  if (!response.ok) {
    const message = typeof data === 'string'
      ? data
      : (data as any)?.message || (data as any)?.error || `Evolution API retornou ${response.status}`
    throw new Error(message)
  }

  return data
}

async function upsertLocalInstance(instanceName: string, overrides?: Partial<{ status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'; phoneNumber: string | null; qrCodeBase64: string | null; lastError: string | null; lastConnectionAt: Date | null }>) {
  const config = getEnvConfig()

  return prisma.whatsAppInstanceConfig.upsert({
    where: { instanceName },
    create: {
      instanceName,
      apiBaseUrl: config.apiUrl,
      webhookSecret: config.webhookSecret,
      status: overrides?.status || 'DISCONNECTED',
      phoneNumber: overrides?.phoneNumber ?? null,
      qrCodeBase64: overrides?.qrCodeBase64 ?? null,
      lastError: overrides?.lastError ?? null,
      lastConnectionAt: overrides?.lastConnectionAt ?? null,
    },
    update: {
      apiBaseUrl: config.apiUrl,
      webhookSecret: config.webhookSecret,
      ...(overrides?.status ? { status: overrides.status } : {}),
      ...(overrides?.phoneNumber !== undefined ? { phoneNumber: overrides.phoneNumber } : {}),
      ...(overrides?.qrCodeBase64 !== undefined ? { qrCodeBase64: overrides.qrCodeBase64 } : {}),
      ...(overrides?.lastError !== undefined ? { lastError: overrides.lastError } : {}),
      ...(overrides?.lastConnectionAt !== undefined ? { lastConnectionAt: overrides.lastConnectionAt } : {}),
      enabled: true,
    },
  })
}

function mapStatus(value: unknown): 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR' {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'open' || normalized === 'connected') return 'CONNECTED'
  if (normalized === 'connecting') return 'CONNECTING'
  if (normalized === 'close' || normalized === 'closed' || normalized === 'refused' || normalized === 'disconnect') return 'DISCONNECTED'
  return 'ERROR'
}

function extractQrCodeBase64(payload: any) {
  return payload?.qrcode?.base64 || payload?.base64 || payload?.qrcode?.qrcode?.base64 || null
}

function extractConnectionState(payload: any) {
  return payload?.instance?.state || payload?.instance?.status || payload?.state || payload?.status || payload?.data?.state || payload?.data?.status || null
}

function extractMessageExternalId(payload: any) {
  return payload?.data?.key?.id || payload?.data?.id || payload?.key?.id || payload?.id || null
}

async function createOutboundLog(instanceName: string, recipientPhone: string, messageText: string) {
  const instance = await upsertLocalInstance(instanceName)
  return prisma.whatsAppMessageLog.create({
    data: {
      instanceConfigId: instance.id,
      recipientPhone,
      messageText,
      direction: 'OUTBOUND',
      status: 'PENDING',
      event: 'send.requested',
    },
  })
}

async function updateLogAfterSend(logId: string, payload: unknown) {
  return prisma.whatsAppMessageLog.update({
    where: { id: logId },
    data: {
      payload: payload as any,
      status: 'SENT',
      event: 'send.message',
      externalMessageId: extractMessageExternalId(payload),
    },
  })
}

async function markLogFailed(logId: string, errorMessage: string) {
  await prisma.whatsAppMessageLog.update({
    where: { id: logId },
    data: {
      status: 'FAILED',
      errorMessage,
      event: 'send.error',
    },
  })
}

export async function setupEvolutionInstance(hostId: string, input?: { phoneNumber?: string | null }) {
  const config = getEnvConfig()
  const instanceName = resolveInstanceName({ hostId })
  await upsertLocalInstance(instanceName, { phoneNumber: input?.phoneNumber ? normalizePhone(input.phoneNumber) : null })

  try {
    const response = await evolutionRequest('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        number: input?.phoneNumber ? normalizePhone(input.phoneNumber) : undefined,
        webhook: {
          enabled: true,
          url: webhookUrl(config),
          byEvents: false,
          base64: true,
          events: DEFAULT_WEBHOOK_EVENTS,
          headers: config.webhookSecret ? { 'x-stackplus-webhook-secret': config.webhookSecret } : {},
        },
      }),
    })

    await upsertLocalInstance(instanceName, {
      status: mapStatus(extractConnectionState(response)),
      qrCodeBase64: extractQrCodeBase64(response),
      lastError: null,
    })

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao criar instância na Evolution API'
    if (/already exists|já existe|exists/i.test(message)) {
      await upsertLocalInstance(instanceName, { lastError: null })
      return getEvolutionInstanceStatus(hostId)
    }

    await upsertLocalInstance(instanceName, { status: 'ERROR', lastError: message })
    throw error
  }
}

export async function connectEvolutionInstance(hostId: string) {
  const instanceName = resolveInstanceName({ hostId })
  const response = await evolutionRequest(`/instance/connect/${encodeURIComponent(instanceName)}`, {
    method: 'GET',
  })

  await upsertLocalInstance(instanceName, {
    status: mapStatus(extractConnectionState(response) || 'connecting'),
    qrCodeBase64: extractQrCodeBase64(response),
    lastError: null,
  })

  return response
}

export async function getEvolutionInstanceStatus(hostId: string) {
  const instanceName = resolveInstanceName({ hostId })
  const response = await evolutionRequest(`/instance/connectionState/${encodeURIComponent(instanceName)}`, {
    method: 'GET',
  })

  const nextStatus = mapStatus(extractConnectionState(response))
  await upsertLocalInstance(instanceName, {
    status: nextStatus,
    qrCodeBase64: extractQrCodeBase64(response),
    lastError: null,
    lastConnectionAt: nextStatus === 'CONNECTED' ? new Date() : undefined,
  })

  const local = await prisma.whatsAppInstanceConfig.findUnique({
    where: { instanceName },
    select: {
      id: true,
      provider: true,
      instanceName: true,
      apiBaseUrl: true,
      enabled: true,
      status: true,
      phoneNumber: true,
      qrCodeBase64: true,
      lastConnectionAt: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return { remote: response, local }
}

export async function sendEvolutionTextMessage(hostId: string, phone: string, text: string): Promise<SendTextResult> {
  const normalizedPhone = normalizePhone(phone)
  if (normalizedPhone.length < 10 || normalizedPhone.length > 13) {
    throw new Error('Telefone de destino inválido para WhatsApp')
  }

  if (!text.trim()) throw new Error('Mensagem não pode ser vazia')

  const instanceName = resolveInstanceName({ hostId })
  const log = await createOutboundLog(instanceName, normalizedPhone, text.trim())

  try {
    const response = await evolutionRequest(`/message/sendText/${encodeURIComponent(instanceName)}`, {
      method: 'POST',
      body: JSON.stringify({
        number: normalizedPhone,
        text: text.trim(),
      }),
    })

    await updateLogAfterSend(log.id, response)
    return { logId: log.id, response }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao enviar mensagem pela Evolution API'
    await markLogFailed(log.id, message)
    throw error
  }
}

export async function listEvolutionMessageLogs(hostId: string, limit = 50) {
  const instanceName = resolveInstanceName({ hostId })
  return prisma.whatsAppMessageLog.findMany({
    where: {
      instanceConfig: {
        instanceName,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
  })
}

function extractInstanceName(payload: any) {
  return payload?.instance?.instanceName
    || payload?.instanceName
    || payload?.data?.instanceName
    || payload?.data?.instance
    || null
}

export async function handleEvolutionWebhook(payload: any, secretHeader?: string | string[]) {
  const config = getEnvConfig()
  const secret = Array.isArray(secretHeader) ? secretHeader[0] : secretHeader
  const instanceName = resolveInstanceName({ instanceName: extractInstanceName(payload) })

  if (config.webhookSecret && secret !== config.webhookSecret) {
    throw new Error('Webhook Evolution inválido: segredo não confere')
  }

  const event = String(payload?.event || payload?.type || '').toLowerCase()
  const externalMessageId = extractMessageExternalId(payload)

  if (event.includes('qrcode')) {
    await upsertLocalInstance(instanceName, {
      status: 'CONNECTING',
      qrCodeBase64: extractQrCodeBase64(payload),
      lastError: null,
    })
  }

  if (event.includes('connection')) {
    const nextStatus = mapStatus(extractConnectionState(payload))
    await upsertLocalInstance(instanceName, {
      status: nextStatus,
      qrCodeBase64: nextStatus === 'CONNECTED' ? null : extractQrCodeBase64(payload),
      lastConnectionAt: nextStatus === 'CONNECTED' ? new Date() : undefined,
      lastError: null,
    })
  }

  if (event.includes('send.message.update') && externalMessageId) {
    const status = String(payload?.data?.status || payload?.status || '').toLowerCase()
    await prisma.whatsAppMessageLog.updateMany({
      where: { externalMessageId },
      data: {
        event,
        status: status.includes('read') ? 'READ' : status.includes('deliver') ? 'DELIVERED' : 'SENT',
        payload: payload as any,
      },
    })
  }

  if (event.includes('messages.upsert')) {
    const instance = await upsertLocalInstance(instanceName)
    await prisma.whatsAppMessageLog.create({
      data: {
        instanceConfigId: instance.id,
        direction: 'INBOUND',
        status: 'RECEIVED',
        event,
        externalMessageId,
        senderPhone: payload?.data?.key?.remoteJid || payload?.data?.sender || null,
        messageText: payload?.data?.message?.conversation || payload?.data?.message?.extendedTextMessage?.text || null,
        payload: payload as any,
      },
    })
  }

  return { ok: true }
}

export async function notifySessionFinished(sessionId: string, hostId?: string) {
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
              phone: true,
            },
          },
        },
      },
    },
  })

  if (hostId && session.homeGame.hostId !== hostId) {
    throw new Error('Acesso negado')
  }

  const attempts = [] as Array<{ userId: string; name: string; phone: string; status: 'sent' | 'skipped'; reason?: string; logId?: string }>

  for (const player of session.playerStates) {
    const phone = player.user.phone ? normalizePhone(player.user.phone) : ''
    if (!phone) {
      attempts.push({ userId: player.userId, name: player.user.name, phone: '', status: 'skipped', reason: 'Usuário sem telefone cadastrado' })
      continue
    }

    const result = Number(player.result)
    const resultLabel = result > 0
      ? `Você tem ${formatCurrency(result)} para receber.`
      : result < 0
        ? `Você tem ${formatCurrency(Math.abs(result))} para pagar.`
        : 'Sua sessão fechou zerada.'

    const message = [
      `StackPlus`,
      `Sessão encerrada: ${session.homeGame.name}`,
      `Jogador: ${player.user.name}`,
      resultLabel,
    ].join('\n')

    const sent = await sendEvolutionTextMessage(session.homeGame.hostId, phone, message)
    attempts.push({ userId: player.userId, name: player.user.name, phone, status: 'sent', logId: sent.logId })
  }

  return {
    sessionId,
    notifiedAt: new Date().toISOString(),
    total: attempts.length,
    sent: attempts.filter((item) => item.status === 'sent').length,
    skipped: attempts.filter((item) => item.status === 'skipped').length,
    attempts,
  }
}

export async function notifySessionFinishedIfEnabled(sessionId: string) {
  const config = getEnvConfig()
  if (!config.autoNotifySessionFinish) return null

  return notifySessionFinished(sessionId)
}