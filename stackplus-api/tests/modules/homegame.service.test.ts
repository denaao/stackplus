import { beforeEach, describe, expect, it, vi } from 'vitest'

const txMock = {
  prepaidChargePending: { deleteMany: vi.fn() },
  sessionFinancialChargePending: { deleteMany: vi.fn() },
  sessionFinancialPayoutPending: { deleteMany: vi.fn() },
  transaction: { deleteMany: vi.fn() },
  playerSessionState: { deleteMany: vi.fn() },
  sessionStaff: { deleteMany: vi.fn() },
  sessionRakeback: { deleteMany: vi.fn() },
  sessionParticipant: { deleteMany: vi.fn() },
  session: { deleteMany: vi.fn() },
  homeGameMember: { deleteMany: vi.fn() },
  homeGame: { delete: vi.fn() },
}

const prismaMock = {
  homeGame: {
    findUniqueOrThrow: vi.fn(),
  },
  $transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<void>) => cb(txMock)),
}

vi.mock('../../src/lib/prisma', () => ({
  prisma: prismaMock,
}))

describe('homegame.service deleteHomeGame', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('cleans all session financial dependencies before deleting home game', async () => {
    prismaMock.homeGame.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'home-1',
      hostId: 'host-1',
    })

    const homeGameService = await import('../../src/modules/homegame/homegame.service')

    await homeGameService.deleteHomeGame('home-1', 'host-1')

    expect(txMock.prepaidChargePending.deleteMany).toHaveBeenCalledWith({ where: { session: { homeGameId: 'home-1' } } })
    expect(txMock.sessionFinancialChargePending.deleteMany).toHaveBeenCalledWith({ where: { session: { homeGameId: 'home-1' } } })
    expect(txMock.sessionFinancialPayoutPending.deleteMany).toHaveBeenCalledWith({ where: { session: { homeGameId: 'home-1' } } })
    expect(txMock.sessionRakeback.deleteMany).toHaveBeenCalledWith({ where: { session: { homeGameId: 'home-1' } } })
    expect(txMock.homeGame.delete).toHaveBeenCalledWith({ where: { id: 'home-1' } })
  })
})
