import 'express-async-errors'
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import routes from './routes'
import { errorMiddleware } from './middlewares/error.middleware'

const app = express()

app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}))
app.use(express.json())

app.use('/api', routes)

app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.use(errorMiddleware)

export default app
