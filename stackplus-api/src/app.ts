import 'express-async-errors'
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import swaggerUi from 'swagger-ui-express'
import routes from './routes'
import { errorMiddleware } from './middlewares/error.middleware'
import { requestLogger } from './middlewares/request-logger.middleware'
import { openApiSpec } from './openapi/spec'
import { prisma } from './lib/prisma'
import { signToken, verifyToken } from './utils/jwt'

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

// Request logging (QUAL-005): pino-http injeta req.log com correlation id
// e loga entrada/saída de cada request automaticamente.
app.use(requestLogger)

app.use('/api', routes)

// OpenAPI docs (interativa em /api/docs, spec crua em /api/openapi.json).
// helmet com CSP default bloqueia inline scripts do swagger-ui; desabilitamos
// CSP apenas nesse caminho via middleware local.
app.get('/api/openapi.json', (_req, res) => {
  res.json(openApiSpec)
})
app.use(
  '/api/docs',
  (_req: Request, res: Response, next: NextFunction) => {
    // swagger-ui usa inline scripts/styles; CSP permissivo local.
    res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: https:")
    next()
  },
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, { customSiteTitle: 'StackPlus API docs' }),
)

app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

/**
 * Health check profundo: valida internals que `/health` simples não cobre.
 *
 * Motivação: no incidente de 21/04, o serviço respondia /health (200 OK) mas
 * POST /auth/login quebrava com "secretOrPrivateKey must have a value"
 * porque JWT_SECRET foi perdida após troca de Source no Railway. Um monitor
 * externo (Better Stack) batendo aqui detecta esse tipo de falha silenciosa.
 *
 * Checks atuais:
 *  - database: SELECT 1 via Prisma (conectividade + credenciais)
 *  - jwt:      sign+verify roundtrip (JWT_SECRET presente e funcional)
 *  - env:     variáveis críticas do runtime presentes e não-vazias
 *
 * Segurança: expõe apenas flags ok/hint no response. Detalhes de erro vão
 * pro log interno (pino). Nomes de env vars podem aparecer no hint quando
 * ausentes — não é informação sensível (os NOMES são públicos, só valores
 * que não podem vazar).
 *
 * Retorna 200 se tudo OK, 503 se qualquer check falhar. Keyword "ok":true
 * no body pra monitores com validação por keyword.
 */
app.get('/health/deep', async (req, res) => {
  const checks: Record<string, { ok: boolean; hint?: string }> = {}

  // 1. Database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = { ok: true }
  } catch (err) {
    req.log?.error({ err }, '[health/deep] database check failed')
    checks.database = { ok: false, hint: 'db-unreachable' }
  }

  // 2. JWT sign+verify roundtrip
  try {
    const token = signToken({
      userId: 'healthcheck',
      email: 'healthcheck@internal',
      role: 'HEALTHCHECK',
    })
    const decoded = verifyToken(token)
    checks.jwt = decoded.userId === 'healthcheck'
      ? { ok: true }
      : { ok: false, hint: 'roundtrip-mismatch' }
  } catch (err) {
    req.log?.error({ err }, '[health/deep] jwt check failed')
    checks.jwt = { ok: false, hint: 'jwt-unconfigured' }
  }

  // 3. Critical env vars present
  const criticalEnvs = [
    'DATABASE_URL',
    'JWT_SECRET',
    'ANNAPAY_CLIENT_ID',
    'ANNAPAY_CLIENT_SECRET',
    'ANNAPAY_WEBHOOK_SECRET',
    'FRONTEND_URL',
    'API_PUBLIC_URL',
    'SANGEUR_WEBHOOK_SECRET',
  ]
  const missingEnvs = criticalEnvs.filter((name) => !process.env[name]?.trim())
  checks.env = missingEnvs.length === 0
    ? { ok: true }
    : { ok: false, hint: `missing:${missingEnvs.join(',')}` }

  const allOk = Object.values(checks).every((c) => c.ok)
  const status = allOk ? 200 : 503

  res.status(status).json({
    ok: allOk,
    timestamp: new Date().toISOString(),
    checks,
  })
})

app.use(errorMiddleware)

export default app
