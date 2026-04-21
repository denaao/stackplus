import rateLimit, { ipKeyGenerator, Options } from 'express-rate-limit'
import { Request } from 'express'

/**
 * Rate limiters para endpoints sensíveis a abuso.
 *
 * Cada limiter usa janela móvel + contador. `standardHeaders: true` adiciona
 * `RateLimit-*` nas respostas pra clientes saberem o quanto resta.
 *
 * Nota: atrás de proxies (Railway, Vercel, Nginx), o Express precisa de
 * `app.set('trust proxy', 1)` pra `req.ip` refletir o IP real do cliente,
 * senão todos os requests vêm do mesmo IP do proxy. Conferir isso no app.ts.
 *
 * Chave do limiter:
 *  - Endpoints não-autenticados (login, register, webhook): por IP
 *  - Endpoints autenticados (pix-out, delete, password): por userId
 *    (fallback pra IP se o request não tem user)
 */

type AuthRequestLike = Request & { user?: { userId?: string } }

/**
 * Gera chave por userId (fallback IP). Usa `ipKeyGenerator` pra tratar IPv6
 * corretamente — o default seria o IP cru mas IPv6 precisa de normalização
 * pra evitar bypass por sub-ranges.
 */
function userOrIpKey(req: Request): string {
  const userId = (req as AuthRequestLike).user?.userId
  if (userId) return `user:${userId}`
  return `ip:${ipKeyGenerator(req.ip ?? '')}`
}

/**
 * Helper: base config comum, só diferenciamos window/max/message.
 */
function makeLimiter(config: Pick<Options, 'windowMs' | 'max'> & {
  message: string
  keyByUser?: boolean
}) {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: config.keyByUser ? userOrIpKey : undefined,
    message: { error: config.message },
  })
}

/**
 * Brute force de credenciais (CPF+senha). 5 tentativas por 15 min por IP.
 * Usuário legítimo que errou pass 5x espera. Atacante não força milhões.
 */
export const loginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.',
})

/**
 * Criação de conta. 3 contas novas por IP por hora.
 * Evita bot criando usuários em massa (spam, abuse).
 */
export const registerLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Muitas contas criadas deste IP. Aguarde 1 hora.',
})

/**
 * Webhook ANNAPAY. 60 req/min por IP.
 * ANNAPAY pode fazer rajadas em re-try, mas 60/min é generoso. Protege
 * contra DoS de atacantes que descobriram o endpoint. Validação de secret
 * já está no controller (SEC-001).
 */
export const webhookLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Rate limit excedido no webhook.',
})

/**
 * Troca de senha (auth + sangeur). 5 tentativas por IP por hora.
 * Previne brute force via endpoint de troca e spam de mudança.
 */
export const passwordChangeLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Muitas trocas de senha. Aguarde 1 hora.',
})

/**
 * PIX out (operação financeira que transfere dinheiro real).
 * 10 por minuto por USUÁRIO (não IP). Um atacante com acesso a conta
 * comprometida não consegue drenar em rajada.
 */
export const pixOutLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyByUser: true,
  message: 'Muitos PIX em sequência. Aguarde 1 minuto.',
})

/**
 * Operações destrutivas (delete de transação, sessão, home game, member).
 * 20 por hora por USUÁRIO. Deletes são raros em operação normal.
 */
export const destructiveLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyByUser: true,
  message: 'Muitas exclusões em sequência. Aguarde e tente novamente.',
})

/**
 * Polling de settle do PIX prepaid. Frontend pode fazer ~12 req/min em
 * condições normais (polling a 5s). 60/min por usuário dá 5x folga.
 */
export const settleLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyByUser: true,
  message: 'Muitas consultas de status. Aguarde 1 minuto.',
})
