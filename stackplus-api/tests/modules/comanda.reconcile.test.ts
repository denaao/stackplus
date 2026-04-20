import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Testes da reconciliação bancária (comanda.service.reconcileHomeGameBank).
 * Cobrem:
 *  - authz (só host/co-host reconcilia)
 *  - caso sem itens pendentes
 *  - criação de bank tx IN (pagamentos PIX recebidos)
 *  - criação de bank tx OUT (transferências enviadas)
 *  - skip de itens já reconciliados (idempotency)
 *  - cenário misto (2 novos + 1 legacy)
 */

// Transação interna usada por recordBankTransaction
const txBankMock = {
  homeGameBankTransaction: { create: vi.fn() },
  homeGame: { update: vi.fn() },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock: any = {
  comandaItem: { findMany: vi.fn() },
  homeGameBankTransaction: { findMany: vi.fn() },
  homeGame: { findUniqueOrThrow: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: typeof txBankMock) => Promise<void>) => {
    await cb(txBankMock)
  }),
}

vi.mock('../../src/lib/prisma', () => ({ prisma: prismaMock }))

const isHomeGameHostMock = vi.fn()
vi.mock('../../src/lib/homegame-auth', () => ({
  isHomeGameHost: isHomeGameHostMock,
  isHomeGameOwner: vi.fn(async () => true),
  assertHomeGameHost: vi.fn(async () => {}),
  assertHomeGameOwner: vi.fn(async () => {}),
}))

// Outras dependências do comanda.service (não usadas no reconcile mas importadas ao top-level).
vi.mock('../../src/modules/banking/annapay.service', () => ({
  createNormalizedCob: vi.fn(),
  checkPixChargeIsPaid: vi.fn(),
  createPix: vi.fn(),
}))

describe('comanda.service reconcileHomeGameBank', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isHomeGameHostMock.mockResolvedValue(true)
    prismaMock.homeGame.findUniqueOrThrow.mockResolvedValue({ bankBalance: 0 })
  })

  it('rejeita reconcile quando usuário não é host nem co-host', async () => {
    isHomeGameHostMock.mockResolvedValueOnce(false)

    const { reconcileHomeGameBank } = await import('../../src/modules/comanda/comanda.service')

    await expect(
      reconcileHomeGameBank('home-1', 'intruder-user'),
    ).rejects.toThrow(/Acesso negado/)
  })

  it('retorna reconciledCount=0 quando não há itens PIX pagos', async () => {
    prismaMock.comandaItem.findMany.mockResolvedValueOnce([])
    prismaMock.homeGame.findUniqueOrThrow.mockResolvedValueOnce({ bankBalance: 500 })

    const { reconcileHomeGameBank } = await import('../../src/modules/comanda/comanda.service')

    const result = await reconcileHomeGameBank('home-1', 'host-1')

    expect(result).toEqual({ reconciledCount: 0, newBalance: 500 })
    expect(txBankMock.homeGameBankTransaction.create).not.toHaveBeenCalled()
  })

  it('cria bank tx direction=IN para pagamento PIX_SPOT novo', async () => {
    prismaMock.comandaItem.findMany.mockResolvedValueOnce([
      { id: 'item-1', type: 'PAYMENT_PIX_SPOT', amount: 100, paymentReference: 'pix-ref-1' },
    ])
    prismaMock.homeGameBankTransaction.findMany.mockResolvedValueOnce([])

    const { reconcileHomeGameBank } = await import('../../src/modules/comanda/comanda.service')

    const result = await reconcileHomeGameBank('home-1', 'host-1')

    expect(result.reconciledCount).toBe(1)
    expect(txBankMock.homeGameBankTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          homeGameId: 'home-1',
          direction: 'IN',
          amount: 100,
          comandaItemId: 'item-1',
          annapayRef: 'pix-ref-1',
        }),
      }),
    )
  })

  it('cria bank tx direction=OUT para TRANSFER_OUT novo', async () => {
    prismaMock.comandaItem.findMany.mockResolvedValueOnce([
      { id: 'item-2', type: 'TRANSFER_OUT', amount: 200, paymentReference: 'pix-ref-2' },
    ])
    prismaMock.homeGameBankTransaction.findMany.mockResolvedValueOnce([])

    const { reconcileHomeGameBank } = await import('../../src/modules/comanda/comanda.service')

    const result = await reconcileHomeGameBank('home-1', 'host-1')

    expect(result.reconciledCount).toBe(1)
    expect(txBankMock.homeGameBankTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ direction: 'OUT', amount: 200 }),
      }),
    )
  })

  it('pula itens já reconciliados (idempotency)', async () => {
    prismaMock.comandaItem.findMany.mockResolvedValueOnce([
      { id: 'item-1', type: 'PAYMENT_PIX_SPOT', amount: 100, paymentReference: 'pix-ref-1' },
      { id: 'item-2', type: 'PAYMENT_PIX_TERM', amount: 150, paymentReference: 'pix-ref-2' },
    ])
    // item-1 já tem bank tx; item-2 não
    prismaMock.homeGameBankTransaction.findMany.mockResolvedValueOnce([
      { comandaItemId: 'item-1' },
    ])

    const { reconcileHomeGameBank } = await import('../../src/modules/comanda/comanda.service')

    const result = await reconcileHomeGameBank('home-1', 'host-1')

    expect(result.reconciledCount).toBe(1)
    expect(txBankMock.homeGameBankTransaction.create).toHaveBeenCalledTimes(1)
    expect(txBankMock.homeGameBankTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ comandaItemId: 'item-2' }),
      }),
    )
  })

  it('cenário misto: 2 novos IN + 1 OUT + 1 já reconciliado', async () => {
    prismaMock.comandaItem.findMany.mockResolvedValueOnce([
      { id: 'item-A', type: 'PAYMENT_PIX_SPOT', amount: 100, paymentReference: 'r-A' },
      { id: 'item-B', type: 'PAYMENT_PIX_TERM', amount: 50, paymentReference: 'r-B' },
      { id: 'item-C', type: 'TRANSFER_OUT', amount: 75, paymentReference: 'r-C' },
      { id: 'item-D', type: 'PAYMENT_PIX_SPOT', amount: 200, paymentReference: 'r-D' },
    ])
    prismaMock.homeGameBankTransaction.findMany.mockResolvedValueOnce([
      { comandaItemId: 'item-D' }, // já reconciliado
    ])
    prismaMock.homeGame.findUniqueOrThrow.mockResolvedValueOnce({ bankBalance: 275 })

    const { reconcileHomeGameBank } = await import('../../src/modules/comanda/comanda.service')

    const result = await reconcileHomeGameBank('home-1', 'host-1')

    expect(result.reconciledCount).toBe(3) // A, B, C
    expect(result.newBalance).toBe(275)
    expect(txBankMock.homeGameBankTransaction.create).toHaveBeenCalledTimes(3)

    // Verifica direções
    const calls = txBankMock.homeGameBankTransaction.create.mock.calls.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c[0].data,
    )
    expect(calls.map((d: { direction: string }) => d.direction)).toEqual(['IN', 'IN', 'OUT'])
  })
})
