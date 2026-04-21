/**
 * Testes de integração do fluxo de autenticação (SEC-004).
 *
 * Cobre: register, login, refresh (rotação), logout (revogação), reuso
 * de refresh token após revogação. Requer DATABASE_URL_TEST definida,
 * senão skippa graciosamente.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import {
  disconnectTestDatabase,
  getTestPrisma,
  isIntegrationEnvAvailable,
  resetTestDatabase,
  setupTestDatabase,
} from './setup'

// Import dinâmico do app só DENTRO dos testes, DEPOIS do setup do DB,
// pra garantir que o Prisma client conecte no DATABASE_URL correto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any

const describeIfEnv = isIntegrationEnvAvailable ? describe : describe.skip

beforeAll(async () => {
  if (!isIntegrationEnvAvailable) return
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST
  await setupTestDatabase()
  // Import depois de setar DATABASE_URL pro Prisma global pegar a URL certa.
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

describeIfEnv('auth integration', () => {
  const registerPayload = {
    name: 'Denis Teste',
    cpf: '12345678909',
    email: 'denis@test.local',
    password: 'senha123',
    pixType: 'EMAIL' as const,
    pixKey: 'denis@test.local',
  }

  it('register cria user + emite access + refresh tokens', async () => {
    const res = await request(app).post('/api/auth/register').send(registerPayload)
    expect(res.status).toBe(201)
    expect(res.body.user).toMatchObject({ name: 'Denis Teste', role: 'PLAYER' })
    expect(typeof res.body.token).toBe('string')
    expect(typeof res.body.refreshToken).toBe('string')
    expect(res.body.token).not.toBe(res.body.refreshToken)

    // DB: refreshToken persiste como hash, nunca em claro.
    const tokens = await getTestPrisma().refreshToken.findMany({ where: { userId: res.body.user.id } })
    expect(tokens).toHaveLength(1)
    expect(tokens[0].tokenHash).not.toBe(res.body.refreshToken)
    expect(tokens[0].revokedAt).toBeNull()
  })

  it('login com CPF+senha emite novo par de tokens', async () => {
    await request(app).post('/api/auth/register').send(registerPayload)

    const loginRes = await request(app).post('/api/auth/login').send({
      cpf: registerPayload.cpf,
      password: registerPayload.password,
    })
    expect(loginRes.status).toBe(200)
    expect(typeof loginRes.body.token).toBe('string')
    expect(typeof loginRes.body.refreshToken).toBe('string')

    // Cria um novo refresh token (não reusa o do register).
    const tokens = await getTestPrisma().refreshToken.findMany()
    expect(tokens).toHaveLength(2)
    expect(tokens.every((t) => t.revokedAt === null)).toBe(true)
  })

  it('login com senha errada devolve 401', async () => {
    await request(app).post('/api/auth/register').send(registerPayload)
    const res = await request(app).post('/api/auth/login').send({
      cpf: registerPayload.cpf,
      password: 'errada',
    })
    expect(res.status).toBe(401)
  })

  it('refresh rotaciona: revoga antigo e emite novo par', async () => {
    const registerRes = await request(app).post('/api/auth/register').send(registerPayload)
    const oldRefreshToken = registerRes.body.refreshToken

    const refreshRes = await request(app).post('/api/auth/refresh').send({
      refreshToken: oldRefreshToken,
    })
    expect(refreshRes.status).toBe(200)
    expect(refreshRes.body.token).not.toBe(registerRes.body.token)
    expect(refreshRes.body.refreshToken).not.toBe(oldRefreshToken)

    // DB: antigo revogado + novo ativo, com chain via replacedBy.
    const tokens = await getTestPrisma().refreshToken.findMany({ orderBy: { createdAt: 'asc' } })
    expect(tokens).toHaveLength(2)
    expect(tokens[0].revokedAt).not.toBeNull()
    expect(tokens[0].replacedBy).toBe(tokens[1].id)
    expect(tokens[1].revokedAt).toBeNull()
  })

  it('reuso de refresh token revogado é rejeitado', async () => {
    const registerRes = await request(app).post('/api/auth/register').send(registerPayload)
    const oldRefreshToken = registerRes.body.refreshToken

    // Primeiro refresh: OK, rotaciona.
    await request(app).post('/api/auth/refresh').send({ refreshToken: oldRefreshToken })

    // Segundo refresh com o MESMO token antigo: deve falhar (já revogado).
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: oldRefreshToken })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('logout revoga todos os refresh tokens do user', async () => {
    const registerRes = await request(app).post('/api/auth/register').send(registerPayload)
    const accessToken = registerRes.body.token

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
    expect(logoutRes.status).toBe(200)
    expect(logoutRes.body.revoked).toBeGreaterThanOrEqual(1)

    // Tentar refresh com token do register deve falhar (foi revogado no logout).
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: registerRes.body.refreshToken })
    expect(refreshRes.status).toBeGreaterThanOrEqual(400)
  })

  it('refresh com token inválido devolve 400', async () => {
    const res = await request(app).post('/api/auth/refresh').send({
      refreshToken: 'token-nao-existe-aaaaa',
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('/auth/me requer access token válido', async () => {
    const registerRes = await request(app).post('/api/auth/register').send(registerPayload)

    const semAuth = await request(app).get('/api/auth/me')
    expect(semAuth.status).toBe(401)

    const comAuth = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${registerRes.body.token}`)
    expect(comAuth.status).toBe(200)
    expect(comAuth.body.cpf).toBe(registerPayload.cpf)
  })
})
