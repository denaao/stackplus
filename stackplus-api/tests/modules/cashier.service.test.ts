import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Testes do cashout flow no cashier service.
 * Cobrem:
 *  - validações de input (chips negativo, sessão inativa)
 *  - pré-requisitos (buy-in anterior obrigatório, proibição de cashout duplicado)
 *  - cálculo de result (profit/loss/zero/busto)
 *  - atualização correta de playerSessionState (chipsOut, currentStack, hasCashedOut)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const txMock: any = {
  transaction: { create: vi.fn(async (args: unknown) => ({ id: 'tx-new', ...((args as { data: unknown }).data ?? {}) })) },
  playerSessionState: { create: vi.fn(), update: vi.fn() },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaMock: any = {
  session: { findUniqueOrThrow: vi.fn() },
  playerSessionState: { findUnique: vi.fn() },
  $transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
}

vi.mock('../../src/lib/prisma', () => ({ prisma: prismaMock }))

// Comanda é integração — mockada pra isolar o cálculo do cashout.
vi.mock('../../src/modules/comanda/comanda.service', () => ({
  findOrOpenComandaWithTx: vi.fn(async () => ({ id: 'comanda-1' })),
  addComandaItemWithTx: vi.fn(async () => ({ id: 'item-1' })),
}))

const ACTIVE_SESSION = {
  id: 'session-1',
  status: 'ACTIVE',
  chipValue: 1, // 1 ficha = R$ 1,00 (simplifica as contas)
  jackpotEnabled: false,
  homeGame: { id: 'home-1', name: 'Game 1', chipValue: 1 },
  homeGameId: 'home-1',
}

function stateFor({
  chipsIn,
  chipsOut = 0,
  currentStack,
  hasCashedOut = false,
}: {
  chipsIn: number
  chipsOut?: number
  currentStack: number
  hasCashedOut?: boolean
}) {
  return {
    sessionId: 'session-1',
    userId: 'user-1',
    chipsIn,
    chipsOut,
    currentStack,
    hasCashedOut,
    user: { id: 'user-1', name: 'Alice', avatarUrl: null },
  }
}

describe('cashier.service registerTransaction — cashout flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.session.findUniqueOrThrow.mockResolvedValue(ACTIVE_SESSION)
    // simula `update` retornando o estado já atualizado
    txMock.playerSessionState.update.mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({
        ...args.data,
        user: { id: 'user-1', name: 'Alice', avatarUrl: null },
      }),
    )
  })

  it('rejeita cashout com chips negativos', async () => {
    prismaMock.playerSessionState.findUnique.mockResolvedValueOnce(
      stateFor({ chipsIn: 100, currentStack: 100 }),
    )

    const { registerTransaction } = await import('../../src/modules/cashier/cashier.service')

    await expect(
      registerTransaction({
        sessionId: 'session-1',
        userId: 'user-1',
        type: 'CASHOUT',
        amount: 0,
        chips: -10,
        registeredBy: 'op-1',
      }),
    ).rejects.toThrow(/negativa/)
  })

  it('rejeita qualquer transação em sessão não-ativa', async () => {
    prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
      ...ACTIVE_SESSION,
      status: 'WAITING',
    })

    const { registerTransaction } = await import('../../src/modules/cashier/cashier.service')

    await expect(
      registerTransaction({
        sessionId: 'session-1',
        userId: 'user-1',
        type: 'CASHOUT',
        amount: 0,
        chips: 100,
        registeredBy: 'op-1',
      }),
    ).rejects.toThrow(/não está ativa/)
  })

  it('rejeita cashout de jogador sem buy-in prévio', async () => {
    prismaMock.playerSessionState.findUnique.mockResolvedValueOnce(null)

    const { registerTransaction } = await import('../../src/modules/cashier/cashier.service')

    await expect(
      registerTransaction({
        sessionId: 'session-1',
        userId: 'user-1',
        type: 'CASHOUT',
        amount: 0,
        chips: 50,
        registeredBy: 'op-1',
      }),
    ).rejects.toThrow(/buy-in primeiro/)
  })

  it('rejeita cashout quando jogador já realizou cashout', async () => {
    prismaMock.playerSessionState.findUnique.mockResolvedValueOnce(
      stateFor({ chipsIn: 100, chipsOut: 120, currentStack: 0, hasCashedOut: true }),
    )

    const { registerTransaction } = await import('../../src/modules/cashier/cashier.service')

    await expect(
      registerTransaction({
        sessionId: 'session-1',
        userId: 'user-1',
        type: 'CASHOUT',
        amount: 0,
        chips: 100,
        registeredBy: 'op-1',
      }),
    ).rejects.toThrow(/já realizou cashout/)
  })

  it('cashout com lucro: stack final > investido → result positivo', async () => {
    prismaMock.playerSessionState.findUnique.mockResolvedValueOnce(
      stateFor({ chipsIn: 100, currentStack: 150 }),
    )

    const { registerTransaction } = await import('../../src/modules/cashier/cashier.service')

    await registerTransaction({
      sessionId: 'session-1',
      userId: 'user-1',
      type: 'CASHOUT',
      amount: 0,
      chips: 150, // sai com 150 fichas (R$ 150)
      registeredBy: 'op-1',
    })

    expect(txMock.playerSessionState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chipsIn: 100,
          chipsOut: 150,
          currentStack: 0,
          hasCashedOut: true,
          result: 50, // chipsOut - chipsIn
        }),
      }),
    )
  })

  it('cashout com prejuízo: stack final < investido → result negativo', async () => {
    prismaMock.playerSessionState.findUnique.mockResolvedValueOnce(
      stateFor({ chipsIn: 200, currentStack: 80 }),
    )

    const { registerTransaction } = await import('../../src/modules/cashier/cashier.service')

    await registerTransaction({
      sessionId: 'session-1',
      userId: 'user-1',
      type: 'CASHOUT',
      amount: 0,
      chips: 80,
      registeredBy: 'op-1',
    })

    expect(txMock.playerSessionState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chipsOut: 80,
          result: -120, // 80 - 200
          hasCashedOut: true,
          currentStack: 0,
        }),
      }),
    )
  })

  it('cashout empate: stack final == investido → result zero', async () => {
    prismaMock.playerSessionState.findUnique.mockResolvedValueOnce(
      stateFor({ chipsIn: 100, currentStack: 100 }),
    )

    const { registerTransaction } = await import('../../src/modules/cashier/cashier.service')

    await registerTransaction({
      sessionId: 'session-1',
      userId: 'user-1',
      type: 'CASHOUT',
      amount: 0,
      chips: 100,
      registeredBy: 'op-1',
    })

    expect(txMock.playerSessionState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ result: 0, chipsOut: 100 }),
      }),
    )
  })

  it('cashout zero chips (busto): jogador perdeu tudo → result = -chipsIn', async () => {
    prismaMock.playerSessionState.findUnique.mockResolvedValueOnce(
      stateFor({ chipsIn: 300, currentStack: 0 }),
    )

    const { registerTransaction } = await import('../../src/modules/cashier/cashier.service')

    await registerTransaction({
      sessionId: 'session-1',
      userId: 'user-1',
      type: 'CASHOUT',
      amount: 0,
      chips: 0, // bustou
      registeredBy: 'op-1',
    })

    expect(txMock.playerSessionState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chipsOut: 0,
          result: -300,
          hasCashedOut: true,
          currentStack: 0,
        }),
      }),
    )
  })
})
