/**
 * Job: apaga RefreshTokens expirados ou revogados há mais de 7 dias.
 *
 * Motivação: a tabela cresce sem parar. Com TTL de 30d + rotação a cada
 * refresh, um usuário ativo gera centenas de registros por mês. Em escala
 * isso vira um problema de espaço e performance (mesmo com índices).
 *
 * Estratégia conservadora: só apaga tokens JÁ EXPIRADOS ou REVOGADOS há
 * mais de 7 dias. Mantém a trilha curta pra forense (ex.: detectar reuso
 * de token revogado em janela recente).
 *
 * Uso:
 *   npm run job:cleanup-refresh-tokens
 *
 * Agendar no Railway: Cron Service separado ou scheduled task
 * (ver docs/RUNBOOK.md).
 */
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'

const GRACE_DAYS = Number(process.env.REFRESH_TOKEN_CLEANUP_GRACE_DAYS || 7)

async function main() {
  const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000)
  logger.info({ cutoff: cutoff.toISOString(), graceDays: GRACE_DAYS }, '[cleanup] starting refresh token cleanup')

  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        // Expirou naturalmente há mais de GRACE_DAYS dias.
        { expiresAt: { lt: cutoff } },
        // Foi revogado há mais de GRACE_DAYS dias.
        { revokedAt: { lt: cutoff } },
      ],
    },
  })

  logger.info({ deleted: result.count }, '[cleanup] refresh token cleanup done')
  return result.count
}

// Execução direta (npm run job:cleanup-refresh-tokens)
// __filename não existe em ESM mas o projeto usa CJS (tsc + node).
const isCli = require.main === module

if (isCli) {
  main()
    .then((count) => {
      console.log(`[cleanup] deleted ${count} refresh token(s)`)
      process.exit(0)
    })
    .catch((err) => {
      console.error('[cleanup] fatal error', err)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}

export { main as cleanupExpiredRefreshTokens }
