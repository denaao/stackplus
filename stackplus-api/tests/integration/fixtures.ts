/**
 * Factories pra criar entidades no DB de teste.
 *
 * Nomes curtos ao estilo `createUser()`, com overrides opcionais. Use em
 * beforeEach/it pra montar cenários. Todos os IDs são UUIDs reais; CPF é
 * gerado sequencial pra evitar conflito de unique.
 */
import { randomUUID } from 'crypto'
import { hashPassword } from '../../src/utils/hash'
import { getTestPrisma } from './setup'
import type { Prisma } from '@prisma/client'

let cpfCounter = 10000000000

function nextCpf(): string {
  cpfCounter += 1
  return String(cpfCounter).padStart(11, '0')
}

export async function createUser(overrides: Partial<Prisma.UserCreateInput> = {}) {
  const prisma = getTestPrisma()
  const password = overrides.passwordHash ? undefined : 'senha123'
  const passwordHash = overrides.passwordHash ?? (await hashPassword(password!))

  return prisma.user.create({
    data: {
      name: 'Test User',
      cpf: nextCpf(),
      email: `user-${randomUUID().slice(0, 8)}@test.local`,
      pixType: 'EMAIL',
      pixKey: `pix-${randomUUID().slice(0, 8)}@test.local`,
      passwordHash,
      role: 'PLAYER',
      ...overrides,
    },
  })
}

export async function createHomeGame(params: {
  hostId: string
  overrides?: Partial<Prisma.HomeGameUncheckedCreateInput>
}) {
  const prisma = getTestPrisma()
  return prisma.homeGame.create({
    data: {
      name: `HG ${randomUUID().slice(0, 6)}`,
      address: 'Endereço de teste',
      dayOfWeek: 'SATURDAY',
      startTime: '20:00',
      chipValue: '1.00',
      joinCode: randomUUID().slice(0, 6).toUpperCase(),
      gameType: 'CASH_GAME',
      financialModule: 'POSTPAID',
      hostId: params.hostId,
      ...params.overrides,
    },
  })
}

export async function addHomeGameMember(params: {
  homeGameId: string
  userId: string
  role?: 'HOST' | 'PLAYER'
}) {
  const prisma = getTestPrisma()
  return prisma.homeGameMember.create({
    data: {
      homeGameId: params.homeGameId,
      userId: params.userId,
      role: params.role ?? 'PLAYER',
    },
  })
}

export async function createSession(params: {
  homeGameId: string
  overrides?: Partial<Prisma.SessionUncheckedCreateInput>
}) {
  const prisma = getTestPrisma()
  return prisma.session.create({
    data: {
      homeGameId: params.homeGameId,
      status: 'ACTIVE',
      chipValue: '1.00',
      startedAt: new Date(),
      ...params.overrides,
    },
  })
}

export async function addSessionParticipant(params: { sessionId: string; userId: string }) {
  const prisma = getTestPrisma()
  return prisma.sessionParticipant.create({
    data: {
      sessionId: params.sessionId,
      userId: params.userId,
    },
  })
}
