import path from 'path'
import dotenv from 'dotenv'
import http from 'http'
import app from './app'
import { initSocket } from './socket/socket'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const PORT = process.env.PORT || 3001
const WEBHOOK_SYNC_INTERVAL_MS = Number(process.env.ANNAPAY_WEBHOOK_SYNC_INTERVAL_MS || '300000')

const server = http.createServer(app)

initSocket(server)

server.listen(PORT, () => {
  console.log(`🚀 STACKPLUS API running on http://localhost:${PORT}`)

  const runWebhookSync = () => {
    // Best-effort webhook sync so manual panel access is not required.
    import('./modules/banking/annapay.service')
      .then(({ syncCobWebhookConfig }) => syncCobWebhookConfig())
      .then((result) => {
        console.log('[annapay] webhook sync ok:', result.payload?.url)
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.warn('[annapay] webhook sync skipped:', message)
      })
  }

  runWebhookSync()
  if (WEBHOOK_SYNC_INTERVAL_MS > 0) {
    setInterval(runWebhookSync, WEBHOOK_SYNC_INTERVAL_MS)
  }
})
