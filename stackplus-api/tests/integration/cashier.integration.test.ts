/**
 * Testes de integração do fluxo do caixa (POSTPAID).
 *
 * Valida o ciclo completo: host cria sessão, jogador entra, buy-in é
 * registrado, cashout fecha o estado do jogador. Valores são consistentes
 * no DB (transaction + player session state + comanda item espelhado).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { signToken } from '../../src/utils/jwt'
import {
  disconnectTestDatabase,
  getTestPrisma,
  isIntegrationEnvAvailable,
  resetTestDatabase,
  setupTestDatabase,
} from './setup'
import { createHomeGame, createSession, createUser, addHomeGameMember, addSessionParticipant } from './fixtures'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any

const describeIfEnv = isIntegrationEnvAvailable ? describe : describe.skip

beforeAll(async () => {
  if (!isIntegrationEnvAvailable) return
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST
  await setupTestDatabase()
  app = (await import('../../src/app')).default
})

beforeEach(async () => {
  if (!isIntegrationEnvAvailable) return
  await resetTestDatabase()
})

afterAll(async () => {
  if (!isIntegrationEnvAvailable) return
  await disconnectTestDatabase()
})

describeIfEnv('cashier integration', () => {
  async function setupScenario() {
    const host = await createUser({ name: 'Host' })
    const player = await createUser({ name: 'Player' })
    const homeGame = await createHomeGame({ hostId: host.id })
    await addHomeGameMember({ homeGameId: homeGame.id, userId: player.id })
    const session = await createSession({ homeGameId: homeGame.id })
    await addSessionParticipant({ sessionId: session.id, userId: player.id })

    const hostToken = signToken({ userId: host.id, email: host.email ?? '', role: host.role })
    return { host, player, homeGame, session, hostToken }
  }

  it('buy-in cria Transaction + PlayerSessionState + ComandaItem espelhado', async () => {
    const { host, player, session, hostToken } = await setupScenario()
    const prisma = getTestPrisma()

    const res = await request(app)
      .post('/api/cashier/transaction')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        sessionId: session.id,
        userId: player.id,
        type: 'BUYIN',
        amount: 100,
        chips: 100,
      })
    expect(res.status).toBe(201)

    // Transaction criada
    const txs = await prisma.transaction.findMany({ where: { sessionId: session.id } })
    expect(txs).toHaveLength(1)
    expect(txs[0].type).toBe('BUYIN')
    expect(Number(txs[0].amount)).toBe(100)
    expect(txs[0].origin).toBe('C')
    expect(txs[0].registeredBy).toBe(host.id)

    // PlayerSessionState atualizado
    const state = await prisma.playerSessionState.findUnique({
      where: { sessionId_userId: { sessionId: session.id, userId: player.id } },
    })
    expect(state).not.toBeNull()
    expect(Number(state!.chipsIn)).toBe(100)
    expect(state!.hasCashedOut).toBe(false)

    // ComandaItem espelhado (CASH_BUYIN debitando saldo do jogador)
    const items = await prisma.comandaItem.findMany({ where: { transactionId: txs[0].id } })
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('CASH_BUYIN')
    expect(Number(items[0].amount)).toBe(100)
  })

  it('buy-in + cashout: player state marca hasCashedOut e result é calculado', async () => {
    const { player, session, hostToken } = await setupScenario()
    const prisma = getTestPrisma()

    // Buy-in de 100
    await request(app)
      .post('/api/cashier/transaction')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ sessionId: session.id, userId: player.id, type: 'BUYIN', amount: 100, chips: 100 })

    // Cashout de 150 (saiu lucrando 50)
    const cashoutRes = await request(app)
      .post('/api/cashier/transaction')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ sessionId: session.id, userId: player.id, type: 'CASHOUT', amount: 150, chips: 150 })
    expect(cashoutRes.status).toBe(201)

    const state = await prisma.playerSessionState.findUnique({
      where: { sessionId_userId: { sessionId: session.id, userId: player.id } },
    })
    expect(state!.hasCashedOut).toBe(true)
    expect(Number(state!.chipsIn)).toBe(100)
    expect(Number(state!.chipsOut)).toBe(150)
    expect(Number(state!.result)).toBe(50)
    expect(Number(state!.currentStack)).toBe(0)
  })

  it('segundo cashout no mesmo jogador é rejeitado', async () => {
    const { player, session, hostToken } = await setupScenario()

    await request(app)
      .post('/api/cashier/transaction')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ sessionId: session.id, userId: player.id, type: 'BUYIN', amount: 100, chips: 100 })

    await request(app)
      .post('/api/cashier/transaction')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ sessionId: session.id, userId: player.id, type: 'CASHOUT', amount: 120, chips: 120 })

    const res = await request(app)
      .post('/api/cashier/transaction')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ sessionId: session.id, userId: player.id, type: 'CASHOUT', amount: 10, chips: 10 })
    expect(res.status).toBe(400)
  })

  it('GET /cashier/transactions filtra por sessionId', async () => {
    const { player, session, hostToken } = await setupScenario()

    await request(app)
      .post('/api/cashier/transaction')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ sessionId: session.id, userId: player.id, type: 'BUYIN', amount: 100, chips: 100 })
    await request(app)
      .post('/api/cashier/transaction')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ sessionId: session.id, userId: player.id, type: 'REBUY', amount: 50, chips: 50 })

    const res = await request(app)
      .get(`/api/cashier/transactions?sessionId=${session.id}`)
      .set('Authorization', `Bearer ${hostToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    const types = res.body.map((t: { type: string }) => t.type).sort()
    expect(types).toEqual(['BUYIN', 'REBUY'])
  })

  it('transação sem auth devolve 401', async () => {
    const { player, session } = await setupScenario()

    const res = await request(app)
      .post('/api/cashier/transaction')
      .send({ sessionId: session.id, userId: player.id, type: 'BUYIN', amount: 100, chips: 100 })
    expect(res.status).toBe(401)
  })
})
