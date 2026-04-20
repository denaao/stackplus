import { beforeEach, describe, expect, it, vi } from 'vitest'

const txMock = {
  prepaidChargePending: { deleteMany: vi.fn() },
  sessionFinancialChargePending: { deleteMany: vi.fn() },
  sessionFinancialPayoutPending: { deleteMany: vi.fn() },
  sangeurSale: { deleteMany: vi.fn() },
  sangeurShiftMovement: { deleteMany: vi.fn() },
  sangeurShift: { deleteMany: vi.fn() },
  transaction: { deleteMany: vi.fn() },
  playerSessionState: { deleteMany: vi.fn() },
  sessionStaff: { deleteMany: vi.fn() },
  sessionRakeback: { deleteMany: vi.fn() },
  sessionParticipant: { deleteMany: vi.fn() },
  session: { delete: vi.fn() },
}

const prismaMock = {
  session: {
    findUniqueOrThrow: vi.fn(),
  },
  $transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<void>) => cb(txMock)),
}

vi.mock('../../src/lib/prisma', () => ({
  prisma: prismaMock,
}))

// Stub do authz: retorna sempre true. Testes específicos de authz existem
// no escopo de homegame-auth (fora daqui).
vi.mock('../../src/lib/homegame-auth', () => ({
  isHomeGameHost: vi.fn(async () => true),
  isHomeGameOwner: vi.fn(async () => true),
  assertHomeGameHost: vi.fn(async () => {}),
  assertHomeGameOwner: vi.fn(async () => {}),
}))

vi.mock('../../src/modules/whatsapp/evolution.service', () => ({
  notifySessionFinishedIfEnabled: vi.fn(),
}))

vi.mock('../../src/modules/banking/annapay.service', () => ({
  generateSessionFinancialReport: vi.fn(),
}))

describe('session.service critical rules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks public session details when session is waiting', async () => {
    prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'session-1',
      status: 'WAITING',
      homeGame: { id: 'home-1', name: 'Game' },
      playerStates: [],
    })

    const sessionService = await import('../../src/modules/session/session.service')

    await expect(sessionService.getPublicSessionById('session-1')).rejects.toThrow('Acesso negado')
  })

  it('cleans financial dependencies when deleting a session', async () => {
    prismaMock.session.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'session-1',
      homeGameId: 'home-1',
      homeGame: { id: 'home-1', hostId: 'host-1' },
    })

    const sessionService = await import('../../src/modules/session/session.service')

    await sessionService.deleteSession('session-1', 'host-1')

    expect(txMock.prepaidChargePending.deleteMany).toHaveBeenCalledWith({ where: { sessionId: 'session-1' } })
    expect(txMock.sessionFinancialChargePending.deleteMany).toHaveBeenCalledWith({ where: { sessionId: 'session-1' } })
    expect(txMock.sessionFinancialPayoutPending.deleteMany).toHaveBeenCalledWith({ where: { sessionId: 'session-1' } })
    expect(txMock.sessionRakeback.deleteMany).toHaveBeenCalledWith({ where: { sessionId: 'session-1' } })
    expect(txMock.session.delete).toHaveBeenCalledWith({ where: { id: 'session-1' } })
  })
})
