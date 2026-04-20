import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Testes da validação de secret no webhook ANNAPAY (SEC-001).
 * Cobrem o handleCobWebhook — em especial o timing-safe compare
 * e os 3 caminhos possíveis (sem header, header errado, header correto).
 */

const settleFromWebhookMock = vi.fn()

vi.mock('../../src/modules/banking/annapay.service', () => ({
  settlePrepaidChargeFromWebhook: settleFromWebhookMock,
}))

// Stub de socket pra não precisar de io server em testes.
vi.mock('../../src/socket/socket', () => ({
  getIO: () => ({
    to: () => ({ emit: vi.fn() }),
  }),
  getPrivateSessionRoom: vi.fn(() => 'room-x'),
  emitSessionRankingUpdated: vi.fn(),
}))

// Stub de ranking (import dinâmico dentro do handler).
vi.mock('../../src/modules/ranking/ranking.service', () => ({
  getRanking: vi.fn(async () => []),
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockReq(opts: { headers?: Record<string, string>; body?: any; ip?: string; path?: string } = {}): any {
  return {
    headers: opts.headers ?? {},
    body: opts.body ?? { id: 'charge-123' },
    ip: opts.ip ?? '127.0.0.1',
    path: opts.path ?? '/webhook/cob',
    method: 'POST',
    originalUrl: opts.path ?? '/webhook/cob',
  }
}

function mockRes() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('annapay.controller handleCobWebhook', () => {
  const ORIGINAL_ENV = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    // Padrão pros testes: settle retorna processed=false pra parar o flow
    // depois do check de secret (que é o foco dos testes).
    settleFromWebhookMock.mockResolvedValue({ processed: false, reason: 'not-paid' })
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('processa quando secret env não está configurado (skip de validação)', async () => {
    delete process.env.ANNAPAY_WEBHOOK_SECRET

    const { handleCobWebhook } = await import('../../src/modules/banking/annapay.controller')
    const req = mockReq({ headers: {} })
    const res = mockRes()

    await handleCobWebhook(req, res)

    expect(settleFromWebhookMock).toHaveBeenCalledTimes(1)
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('retorna 200 com missing-webhook-secret quando header ausente (healthcheck-friendly)', async () => {
    process.env.ANNAPAY_WEBHOOK_SECRET = 'super-secret-123'

    const { handleCobWebhook } = await import('../../src/modules/banking/annapay.controller')
    const req = mockReq({ headers: {} })
    const res = mockRes()

    await handleCobWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ignored: 'missing-webhook-secret' }),
    )
    expect(settleFromWebhookMock).not.toHaveBeenCalled()
  })

  it('retorna 401 invalid-webhook-secret quando header está presente mas errado', async () => {
    process.env.ANNAPAY_WEBHOOK_SECRET = 'super-secret-123'
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { handleCobWebhook } = await import('../../src/modules/banking/annapay.controller')
    const req = mockReq({ headers: { 'x-annapay-webhook-secret': 'wrong-secret-xyz' } })
    const res = mockRes()

    await handleCobWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ignored: 'invalid-webhook-secret' }),
    )
    expect(settleFromWebhookMock).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('invalid secret attempt'),
      expect.any(Object),
    )

    consoleSpy.mockRestore()
  })

  it('retorna 401 quando secrets têm tamanhos diferentes (timing-safe compare rejeita)', async () => {
    process.env.ANNAPAY_WEBHOOK_SECRET = 'short'
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { handleCobWebhook } = await import('../../src/modules/banking/annapay.controller')
    const req = mockReq({ headers: { 'x-annapay-webhook-secret': 'muuuuuuuito-longo-e-errado' } })
    const res = mockRes()

    await handleCobWebhook(req, res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(settleFromWebhookMock).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('processa normalmente quando header X-Annapay-Webhook-Secret bate com env', async () => {
    process.env.ANNAPAY_WEBHOOK_SECRET = 'super-secret-123'

    const { handleCobWebhook } = await import('../../src/modules/banking/annapay.controller')
    const req = mockReq({ headers: { 'x-annapay-webhook-secret': 'super-secret-123' } })
    const res = mockRes()

    await handleCobWebhook(req, res)

    expect(settleFromWebhookMock).toHaveBeenCalledTimes(1)
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('aceita header alternativo X-Webhook-Secret', async () => {
    process.env.ANNAPAY_WEBHOOK_SECRET = 'super-secret-123'

    const { handleCobWebhook } = await import('../../src/modules/banking/annapay.controller')
    const req = mockReq({ headers: { 'x-webhook-secret': 'super-secret-123' } })
    const res = mockRes()

    await handleCobWebhook(req, res)

    expect(settleFromWebhookMock).toHaveBeenCalledTimes(1)
  })
})
