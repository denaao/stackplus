import 'dotenv/config'
import http from 'http'
import app from './app'
import { initSocket } from './socket/socket'

const PORT = process.env.PORT || 3001

const server = http.createServer(app)

initSocket(server)

server.listen(PORT, () => {
  console.log(`🚀 STACKPLUS API running on http://localhost:${PORT}`)
})
