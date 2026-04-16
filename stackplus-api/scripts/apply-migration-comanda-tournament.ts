/**
 * Script para aplicar a migration 20260415_add_comanda_tournament.
 * Rode da pasta stackplus-api:
 *   npx tsx scripts/apply-migration-comanda-tournament.ts
 */
import { prisma } from '../src/lib/prisma'
import * as fs from 'fs'
import * as path from 'path'

const MIGRATION_NAME = '20260415_add_comanda_tournament'

async function main() {
  const sqlPath = path.join(
    __dirname,
    '../prisma/migrations',
    MIGRATION_NAME,
    'migration.sql',
  )
  const sql = fs.readFileSync(sqlPath, 'utf8')

  // Quebra em statements individuais (ignora linhas de comentário e vazias)
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'))

  console.log(`Applying ${statements.length} statements...`)

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    try {
      await prisma.$executeRawUnsafe(stmt)
      console.log(`  [${i + 1}/${statements.length}] OK`)
    } catch (err: any) {
      if (err.message?.includes('already exists')) {
        console.log(`  [${i + 1}/${statements.length}] SKIP (already exists)`)
      } else {
        console.error(`  [${i + 1}/${statements.length}] ERROR: ${err.message}`)
        throw err
      }
    }
  }

  // Registra a migration no histórico do Prisma
  await prisma.$executeRawUnsafe(`
    INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
    VALUES (
      gen_random_uuid(),
      'manual',
      NOW(),
      '${MIGRATION_NAME}',
      NULL,
      NULL,
      NOW(),
      1
    )
    ON CONFLICT (migration_name) DO NOTHING
  `)

  console.log('\nMigration applied and registered successfully!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
