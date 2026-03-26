import 'express-async-errors'
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import routes from './routes'
import { errorMiddleware } from './middlewares/error.middleware'

const app = express()

app.use(helmet())
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
].filter(Boolean) as string[]

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}))
app.use(express.json())

app.use('/api', routes)

app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.use(errorMiddleware)

export default app
