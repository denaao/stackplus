import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = {
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
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

describe('auth.service register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forces new public users to PLAYER role', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    prismaMock.user.findFirst.mockResolvedValue(null)
    prismaMock.user.create.mockResolvedValue({
      id: 'user-1',
      name: 'User',
      email: 'user@test.com',
      cpf: null,
      phone: null,
      pixType: 'EMAIL',
      pixKey: 'user@test.com',
      role: 'PLAYER',
      createdAt: new Date(),
    })

    const authService = await import('../../src/modules/auth/auth.service')

    const result = await authService.register({
      name: 'User',
      email: 'user@test.com',
      password: '123456',
      pixType: 'EMAIL' as any,
      pixKey: 'user@test.com',
    })

    expect(prismaMock.user.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.user.create.mock.calls[0][0].data.role).toBe('PLAYER')
    expect(result.user.role).toBe('PLAYER')
    expect(result.token).toBe('fake-token')
  })
})
