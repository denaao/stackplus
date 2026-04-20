import 'express-async-errors'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import routes from './routes'
import { errorMiddleware } from './middlewares/error.middleware'

const app = express()

// Railway/Vercel colocam 1 proxy na frente. Sem isso, req.ip é sempre
// o IP do proxy e rate limiters viram globais (todos os clientes
// compartilham o mesmo contador). Valor 1 lê o primeiro hop de X-Forwarded-For.
app.set('trust proxy', 1)

app.use(helmet())
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://www.stackplus.com.br',
  'https://stackplus.com.br',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
].filter(Boolean) as string[]

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server and non-browser requests without an Origin header.
    if (!origin) return callback(null, true)

    const isAllowed =
      allowedOrigins.includes(origin) ||
      /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)

    if (isAllowed) return callback(null, true)

    return callback(new Error('Origin not allowed by CORS'))
  },
  credentials: true,
}))
app.use(express.json())

app.use('/api', routes)

app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.use(errorMiddleware)

export default app
