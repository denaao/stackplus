import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Testes da idempotency atômica do webhook ANNAPAY (SEC-006).
 * Cobrem o fluxo de settlePrepaidChargeFromWebhook — em especial
 * o claim via UPDATE condicional e o rollback de erro.
 */

const prismaMock = {
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}

vi.mock('../../src/lib/prisma', () => ({
  prisma: prismaMock,
}))

// Stub do authz pra não precisar de mock extra em prisma.user/homeGame.
vi.mock('../../src/lib/homegame-auth', () => ({
  isHomeGameHost: vi.fn(async () => true),
  isHomeGameOwner: vi.fn(async () => true),
  assertHomeGameHost: vi.fn(async () => {}),
  assertHomeGameOwner: vi.fn(async () => {}),
}))

// Mock do cashier (import dinâmico dentro do service).
const registerTransactionMock = vi.fn()
vi.mock('../../src/modules/cashier/cashier.service', () => ({
  registerTransaction: registerTransactionMock,
}))

const PENDING_ROW = {
  chargeId: 'charge-123',
  sessionId: 'session-1',
  userId: 'user-1',
  virtualAccount: null,
  type: 'BUYIN',
  chips: '100',
  amount: '100.00',
  registeredBy: 'user-1',
  status: 'PROCESSING',
}

describe('annapay.service settlePrepaidChargeFromWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna missing-charge-id quando payload não tem id', async () => {
    const { settlePrepaidChargeFromWebhook } = await import('../../src/modules/banking/annapay.service')

    const result = await settlePrepaidChargeFromWebhook({})

    expect(result).toEqual({ processed: false, reason: 'missing-charge-id' })
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled()
  })

  it('retorna pending-not-found quando chargeId não existe no banco', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([]) // pre-check vazio

    const { settlePrepaidChargeFromWebhook } = await import('../../src/modules/banking/annapay.service')

    const result = await settlePrepaidChargeFromWebhook({ id: 'charge-123' })

    expect(result).toEqual({
      processed: false,
      reason: 'pending-not-found',
      chargeId: 'charge-123',
    })
  })

  it('retorna already-settled no pre-check quando status já é SETTLED', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { status: 'SETTLED', sessionId: 'session-1' },
    ])

    const { settlePrepaidChargeFromWebhook } = await import('../../src/modules/banking/annapay.service')

    const result = await settlePrepaidChargeFromWebhook({ id: 'charge-123' })

    expect(result).toEqual({
      processed: true,
      reason: 'already-settled',
      chargeId: 'charge-123',
      sessionId: 'session-1',
    })
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled()
  })

  it('retorna not-paid quando status do payload não indica pagamento', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { status: 'PENDING', sessionId: 'session-1' },
    ])

    const { settlePrepaidChargeFromWebhook } = await import('../../src/modules/banking/annapay.service')

    const result = await settlePrepaidChargeFromWebhook({
      id: 'charge-123',
      status: 'ATIVA', // status não-pago
    })

    expect(result.processed).toBe(false)
    expect(result.reason).toBe('not-paid')
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled()
  })

  it('registra transação e marca SETTLED quando pending e pago', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ status: 'PENDING', sessionId: 'session-1' }])
      .mockResolvedValueOnce([PENDING_ROW])
    prismaMock.$executeRaw
      .mockResolvedValueOnce(1) // claim OK
      .mockResolvedValueOnce(1) // SETTLED update
    registerTransactionMock.mockResolvedValueOnce({
      id: 'tx-1',
      sessionId: 'session-1',
      userId: 'user-1',
    })

    const { settlePrepaidChargeFromWebhook } = await import('../../src/modules/banking/annapay.service')

    const result = await settlePrepaidChargeFromWebhook({
      id: 'charge-123',
      status: 'CONCLUIDA',
    })

    expect(result.processed).toBe(true)
    expect(result.reason).toBe('registered')
    expect(result.chargeId).toBe('charge-123')
    expect(result.sessionId).toBe('session-1')
    expect(registerTransactionMock).toHaveBeenCalledTimes(1)
    expect(registerTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        userId: 'user-1',
        type: 'BUYIN',
        note: expect.stringContaining('charge-123'),
      }),
    )
  })

  it('retorna being-processed quando outro webhook concorrente pegou o claim', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ status: 'PENDING', sessionId: 'session-1' }]) // pre-check
      .mockResolvedValueOnce([{ status: 'PROCESSING', sessionId: 'session-1' }]) // current após claim falhar
    prismaMock.$executeRaw.mockResolvedValueOnce(0) // claim falhou (0 rows)

    const { settlePrepaidChargeFromWebhook } = await import('../../src/modules/banking/annapay.service')

    const result = await settlePrepaidChargeFromWebhook({
      id: 'charge-123',
      status: 'CONCLUIDA',
    })

    expect(result.processed).toBe(false)
    expect(result.reason).toBe('being-processed')
    expect(registerTransactionMock).not.toHaveBeenCalled()
  })

  it('retorna already-settled quando claim falha por outro webhook ter finalizado', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ status: 'PENDING', sessionId: 'session-1' }])
      .mockResolvedValueOnce([{ status: 'SETTLED', sessionId: 'session-1' }])
    prismaMock.$executeRaw.mockResolvedValueOnce(0)

    const { settlePrepaidChargeFromWebhook } = await import('../../src/modules/banking/annapay.service')

    const result = await settlePrepaidChargeFromWebhook({
      id: 'charge-123',
      status: 'CONCLUIDA',
    })

    expect(result.processed).toBe(true)
    expect(result.reason).toBe('already-settled')
    expect(registerTransactionMock).not.toHaveBeenCalled()
  })

  it('marca already-registered quando registerTransaction dispara "buy-in já realizado"', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ status: 'PENDING', sessionId: 'session-1' }])
      .mockResolvedValueOnce([PENDING_ROW])
    prismaMock.$executeRaw
      .mockResolvedValueOnce(1) // claim
      .mockResolvedValueOnce(1) // SETTLED após detectar duplicata
    registerTransactionMock.mockRejectedValueOnce(
      new Error('Buy-in já realizado para este jogador nesta sessão'),
    )

    const { settlePrepaidChargeFromWebhook } = await import('../../src/modules/banking/annapay.service')

    const result = await settlePrepaidChargeFromWebhook({
      id: 'charge-123',
      status: 'CONCLUIDA',
    })

    expect(result.processed).toBe(true)
    expect(result.reason).toBe('already-registered')
  })

  it('reverte pra PENDING e rethrow quando registerTransaction falha com erro genérico', async () => {
    prismaMock.$queryRaw
      .mockResolvedValueOnce([{ status: 'PENDING', sessionId: 'session-1' }])
      .mockResolvedValueOnce([PENDING_ROW])
    prismaMock.$executeRaw
      .mockResolvedValueOnce(1) // claim
      .mockResolvedValueOnce(1) // revert PROCESSING → PENDING
    registerTransactionMock.mockRejectedValueOnce(
      new Error('Falha inesperada no cashier service'),
    )

    const { settlePrepaidChargeFromWebhook } = await import('../../src/modules/banking/annapay.service')

    await expect(
      settlePrepaidChargeFromWebhook({ id: 'charge-123', status: 'CONCLUIDA' }),
    ).rejects.toThrow('Falha inesperada')

    // Deve ter chamado executeRaw 2x: claim + revert (não mais o SETTLED)
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(2)
  })
})
