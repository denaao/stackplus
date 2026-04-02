import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import http from 'http'
import app from './app'
import { initSocket } from './socket/socket'

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
