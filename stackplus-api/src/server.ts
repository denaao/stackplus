import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import http from 'http'

const dotenvCandidates = [
  path.resolve(__dirname, '../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'stackplus-api/.env'),
]

const dotenvPath = dotenvCandidates.find((candidate) => fs.existsSync(candidate))
if (dotenvPath) {
  dotenv.config({ path: dotenvPath })
} else {
  dotenv.config()
}

// IMPORTANTE: initSentry precisa rodar ANTES dos imports do app e do Prisma
// para que o Sentry instrumente corretamente o Node runtime. Se SENTRY_DSN
// não estiver definido, vira no-op.
import { initSentry, flushSentry } from './lib/sentry'
initSentry()

import app from './app'
import { initSocket } from './socket/socket'

const PORT = process.env.PORT || 3001
const WEBHOOK_SYNC_INTERVAL_MS = Number(process.env.ANNAPAY_WEBHOOK_SYNC_INTERVAL_MS || '0')
const AUTO_WEBHOOK_SYNC_ENABLED = process.env.ANNAPAY_AUTO_WEBHOOK_SYNC === 'true'

const server = http.createServer(app)

initSocket(server)

server.listen(PORT, () => {
  console.log(`🚀 STACKPLUS API running on http://localhost:${PORT}`)

  const runWebhookSync = () => {
    // Best-effort webhook sync so manual panel access is not required.
    import('./modules/banking/annapay.service')
      .then(({ syncCobWebhookConfig }) => syncCobWebhookConfig())
      .then((result) => {
        console.log('[annapay] webhook sync ok:', result.payload?.uri_pix)
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.warn('[annapay] webhook sync skipped:', message)
      })
  }

  if (AUTO_WEBHOOK_SYNC_ENABLED) {
    runWebhookSync()
    if (WEBHOOK_SYNC_INTERVAL_MS > 0) {
      console.log(`[annapay] periodic webhook sync enabled (${WEBHOOK_SYNC_INTERVAL_MS}ms)`)
      setInterval(runWebhookSync, WEBHOOK_SYNC_INTERVAL_MS)
    }
  } else {
    console.log('[annapay] auto webhook sync disabled (set ANNAPAY_AUTO_WEBHOOK_SYNC=true to enable)')
  }
})

// Graceful shutdown: drena eventos pendentes do Sentry antes de sair.
// Railway manda SIGTERM; Ctrl+C local manda SIGINT.
async function shutdown(signal: string) {
  console.log(`[shutdown] received ${signal}, flushing Sentry...`)
  await flushSentry(2000)
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
