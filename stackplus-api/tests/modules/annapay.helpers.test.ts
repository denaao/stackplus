import { describe, expect, it, vi } from 'vitest'

/**
 * Testes das funções auxiliares do generateSessionFinancialReport (QUAL-001 follow-up).
 * Cobrem matemática pura: normalização de enum, fallback de modo, distribuição
 * de rakeback com correção de arredondamento, extração de CPF/CNPJ de PIX.
 *
 * A função generateSessionFinancialReport em si tem 300+ linhas e orquestra
 * múltiplos agentes — teste dela requer integração (DB real). Aqui cobrimos
 * só as decisões matemáticas isoladamente.
 */

// Mocks mínimos pra carregar o módulo sem disparar efeitos colaterais.
vi.mock('../../src/lib/prisma', () => ({ prisma: {} }))
vi.mock('../../src/lib/homegame-auth', () => ({
  isHomeGameHost: vi.fn(async () => true),
  isHomeGameOwner: vi.fn(async () => true),
  assertHomeGameHost: vi.fn(),
  assertHomeGameOwner: vi.fn(),
}))

describe('annapay.service helpers', () => {
  describe('normalizeFinancialModule', () => {
    it('retorna PREPAID quando input é "PREPAID"', async () => {
      const { normalizeFinancialModule } = await import('../../src/modules/banking/annapay.service')
      expect(normalizeFinancialModule('PREPAID')).toBe('PREPAID')
      expect(normalizeFinancialModule('prepaid')).toBe('PREPAID')
    })

    it('retorna HYBRID quando input é "HYBRID"', async () => {
      const { normalizeFinancialModule } = await import('../../src/modules/banking/annapay.service')
      expect(normalizeFinancialModule('HYBRID')).toBe('HYBRID')
    })

    it('fallback pra POSTPAID quando input é null, vazio ou desconhecido', async () => {
      const { normalizeFinancialModule } = await import('../../src/modules/banking/annapay.service')
      expect(normalizeFinancialModule(null)).toBe('POSTPAID')
      expect(normalizeFinancialModule(undefined)).toBe('POSTPAID')
      expect(normalizeFinancialModule('')).toBe('POSTPAID')
      expect(normalizeFinancialModule('FOO')).toBe('POSTPAID')
    })
  })

  describe('normalizeMemberPaymentMode', () => {
    it('normaliza PREPAID / POSTPAID', async () => {
      const { normalizeMemberPaymentMode } = await import('../../src/modules/banking/annapay.service')
      expect(normalizeMemberPaymentMode('PREPAID')).toBe('PREPAID')
      expect(normalizeMemberPaymentMode('postpaid')).toBe('POSTPAID')
    })

    it('retorna null pra valores inválidos', async () => {
      const { normalizeMemberPaymentMode } = await import('../../src/modules/banking/annapay.service')
      expect(normalizeMemberPaymentMode(null)).toBe(null)
      expect(normalizeMemberPaymentMode('FOO')).toBe(null)
    })
  })

  describe('resolvePlayerMode', () => {
    it('POSTPAID do HG sobrescreve modo do jogador', async () => {
      const { resolvePlayerMode } = await import('../../src/modules/banking/annapay.service')
      expect(resolvePlayerMode('POSTPAID', 'PREPAID')).toBe('POSTPAID')
      expect(resolvePlayerMode('POSTPAID', null)).toBe('POSTPAID')
    })

    it('PREPAID do HG sobrescreve modo do jogador', async () => {
      const { resolvePlayerMode } = await import('../../src/modules/banking/annapay.service')
      expect(resolvePlayerMode('PREPAID', 'POSTPAID')).toBe('PREPAID')
    })

    it('HYBRID usa o modo declarado do jogador, default POSTPAID', async () => {
      const { resolvePlayerMode } = await import('../../src/modules/banking/annapay.service')
      expect(resolvePlayerMode('HYBRID', 'PREPAID')).toBe('PREPAID')
      expect(resolvePlayerMode('HYBRID', 'POSTPAID')).toBe('POSTPAID')
      expect(resolvePlayerMode('HYBRID', null)).toBe('POSTPAID')
    })
  })

  describe('resolveCpfCnpjFromPix', () => {
    it('PIX type=CPF com 11 dígitos usa direto', async () => {
      const { resolveCpfCnpjFromPix } = await import('../../src/modules/banking/annapay.service')
      const r = resolveCpfCnpjFromPix({
        pixType: 'CPF',
        pixKey: '123.456.789-01',
        cpf: null,
      })
      expect(r.cpf).toBe('12345678901')
      expect(r.cnpj).toBe(null)
    })

    it('PIX type=CNPJ com 14 dígitos usa direto', async () => {
      const { resolveCpfCnpjFromPix } = await import('../../src/modules/banking/annapay.service')
      const r = resolveCpfCnpjFromPix({
        pixType: 'CNPJ',
        pixKey: '12.345.678/0001-90',
        cpf: null,
      })
      expect(r.cnpj).toBe('12345678000190')
      expect(r.cpf).toBe(null)
    })

    it('fallback pro CPF cadastrado do usuário quando PIX não é CPF/CNPJ', async () => {
      const { resolveCpfCnpjFromPix } = await import('../../src/modules/banking/annapay.service')
      const r = resolveCpfCnpjFromPix({
        pixType: 'EMAIL',
        pixKey: 'user@test.com',
        cpf: '12345678901',
      })
      expect(r.cpf).toBe('12345678901')
    })

    it('retorna tudo null quando não tem fonte válida', async () => {
      const { resolveCpfCnpjFromPix } = await import('../../src/modules/banking/annapay.service')
      const r = resolveCpfCnpjFromPix({
        pixType: 'EMAIL',
        pixKey: 'user@test.com',
        cpf: null,
      })
      expect(r.cpf).toBe(null)
      expect(r.cnpj).toBe(null)
    })
  })

  describe('buildRakebackByUserId', () => {
    it('retorna vazio quando totalRake é 0', async () => {
      const { buildRakebackByUserId } = await import('../../src/modules/banking/annapay.service')
      const r = buildRakebackByUserId({ totalRake: 0, rakebackAssignments: [{ userId: 'u1', percent: 50 }] })
      expect(r).toEqual({})
    })

    it('retorna vazio quando não há assignments', async () => {
      const { buildRakebackByUserId } = await import('../../src/modules/banking/annapay.service')
      const r = buildRakebackByUserId({ totalRake: 100, rakebackAssignments: [] })
      expect(r).toEqual({})
    })

    it('retorna vazio quando todos os percent são 0 ou inválidos', async () => {
      const { buildRakebackByUserId } = await import('../../src/modules/banking/annapay.service')
      const r = buildRakebackByUserId({
        totalRake: 100,
        rakebackAssignments: [{ userId: 'u1', percent: 0 }, { userId: 'u2', percent: -5 }],
      })
      expect(r).toEqual({})
    })

    it('distribui 50/50 corretamente', async () => {
      const { buildRakebackByUserId } = await import('../../src/modules/banking/annapay.service')
      const r = buildRakebackByUserId({
        totalRake: 100,
        rakebackAssignments: [
          { userId: 'alice', percent: 50 },
          { userId: 'bob', percent: 50 },
        ],
      })
      expect(r).toEqual({ alice: 50, bob: 50 })
    })

    it('percent único 100% → jogador recebe rake inteiro', async () => {
      const { buildRakebackByUserId } = await import('../../src/modules/banking/annapay.service')
      const r = buildRakebackByUserId({
        totalRake: 250.5,
        rakebackAssignments: [{ userId: 'only', percent: 100 }],
      })
      expect(r).toEqual({ only: 250.5 })
    })

    it('corrige arredondamento em 3 jogadores com 33.33% cada (soma = target)', async () => {
      const { buildRakebackByUserId } = await import('../../src/modules/banking/annapay.service')
      const r = buildRakebackByUserId({
        totalRake: 100,
        rakebackAssignments: [
          { userId: 'a', percent: 33.33 },
          { userId: 'b', percent: 33.33 },
          { userId: 'c', percent: 33.34 },
        ],
      })
      const total = r.a + r.b + r.c
      // soma dos percents = 100 → target = 100. Não pode ter "centavo sumido".
      expect(total).toBeCloseTo(100, 2)
    })

    it('rakeback parcial: 60% → distribui só 60% do rake', async () => {
      const { buildRakebackByUserId } = await import('../../src/modules/banking/annapay.service')
      const r = buildRakebackByUserId({
        totalRake: 100,
        rakebackAssignments: [{ userId: 'only', percent: 60 }],
      })
      expect(r).toEqual({ only: 60 })
    })

    it('percent como string numérica também funciona', async () => {
      const { buildRakebackByUserId } = await import('../../src/modules/banking/annapay.service')
      const r = buildRakebackByUserId({
        totalRake: 200,
        rakebackAssignments: [{ userId: 'alice', percent: '25' as unknown }],
      })
      expect(r.alice).toBe(50)
    })
  })
})
