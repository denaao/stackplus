/**
 * Setup de testes de integração com Postgres real.
 *
 * Como rodar localmente:
 *   1. Suba um Postgres de teste (docker run --rm -p 5433:5432 -e POSTGRES_PASSWORD=test -d postgres:15)
 *   2. Defina a env var:
 *      DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/stackplus_test
 *   3. Rode: npx prisma migrate deploy (uma vez, pra criar tabelas)
 *   4. npm test -- integration
 *
 * Se DATABASE_URL_TEST não estiver setada, os testes são skippados graciosamente
 * em vez de falhar. Isso permite `npm test` funcionar em CI simples ou local
 * sem Postgres rodando.
 *
 * Limpeza entre testes: TRUNCATE em todas as tabelas do schema (preservando
 * estrutura). Sequences resetam automaticamente no Postgres com RESTART IDENTITY.
 */
import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'

const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST

export const isIntegrationEnvAvailable = Boolean(TEST_DATABASE_URL)

let client: PrismaClient | null = null

export function getTestPrisma(): PrismaClient {
  if (!TEST_DATABASE_URL) {
    throw new Error('DATABASE_URL_TEST não está definida — não é pra chamar getTestPrisma sem isso')
  }
  if (!client) {
    client = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
      log: ['error'],
    })
  }
  return client
}

/**
 * Roda prisma migrate deploy no DB de teste. Chame uma vez no setup
 * global (beforeAll) antes de todos os testes de integração.
 */
export async function setupTestDatabase(): Promise<void> {
  if (!TEST_DATABASE_URL) return
  try {
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'pipe',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Falha ao rodar migrations no DB de teste: ${msg}`)
  }
}

/**
 * Apaga dados de todas as tabelas (preserva schema). Use em beforeEach
 * pra isolar casos. Ordem das tabelas importa por causa de FKs — fazemos
 * dinâmico: pega todos os nomes e TRUNCATE RESTART IDENTITY CASCADE.
 */
export async function resetTestDatabase(): Promise<void> {
  if (!client) return
  // Lista tabelas do schema public exceto _prisma_migrations.
  const tables = await client.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `
  if (tables.length === 0) return

  // CASCADE derruba FKs temporariamente; RESTART IDENTITY zera sequences.
  const names = tables.map((t) => `"public"."${t.tablename}"`).join(', ')
  await client.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`)
}

export async function disconnectTestDatabase(): Promise<void> {
  if (client) {
    await client.$disconnect()
    client = null
  }
}
