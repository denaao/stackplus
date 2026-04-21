import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  refreshToken: {
    create: vi.fn(),
  },
}

vi.mock('../../src/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('../../src/utils/hash', () => ({
  hashPassword: vi.fn(async () => 'hashed-password'),
  comparePassword: vi.fn(),
}))

vi.mock('../../src/utils/jwt', () => ({
  signToken: vi.fn(() => 'fake-token'),
}))

// Stub do refresh-token helper — evita mock granular do crypto/db.
vi.mock('../../src/lib/refresh-token', () => ({
  emitRefreshTokenForUser: vi.fn(async () => ({
    token: 'fake-refresh-token',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  })),
  rotateRefreshToken: vi.fn(),
  revokeAllForUser: vi.fn(),
}))

describe('auth.service register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forces new public users to PLAYER role', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue({
      id: 'user-1',
      name: 'User',
      email: 'user@test.com',
      cpf: '12345678901',
      phone: null,
      pixType: 'EMAIL',
      pixKey: 'user@test.com',
      role: 'PLAYER',
      createdAt: new Date(),
    })

    const authService = await import('../../src/modules/auth/auth.service')

    const result = await authService.register({
      name: 'User',
      cpf: '123.456.789-01',
      email: 'user@test.com',
      password: '123456',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pixType: 'EMAIL' as any,
      pixKey: 'user@test.com',
    })

    expect(prismaMock.user.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.user.create.mock.calls[0][0].data.role).toBe('PLAYER')
    expect(prismaMock.user.create.mock.calls[0][0].data.cpf).toBe('12345678901')
    expect(result.user.role).toBe('PLAYER')
    expect(result.token).toBe('fake-token')
    // SEC-004: register tambem emite refresh token.
    expect(result.refreshToken).toBe('fake-refresh-token')
  })
})
