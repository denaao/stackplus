import rateLimit from 'express-rate-limit'

/**
 * Rate limiters para endpoints sensíveis a abuso.
 *
 * Cada limiter usa janela móvel + contador por IP. `standardHeaders: true`
 * adiciona `RateLimit-*` nas respostas pra clientes saberem o quanto resta.
 *
 * Nota: atrás de proxies (Railway, Vercel, Nginx), o Express precisa de
 * `app.set('trust proxy', 1)` pra `req.ip` refletir o IP real do cliente,
 * senão todos os requests vêm do mesmo IP do proxy. Conferir isso no app.ts.
 */

/**
 * Brute force de credenciais (CPF+senha). 5 tentativas por 15 min por IP.
 * Usuário legítimo que errou pass 5x espera. Atacante não força milhões.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.',
  },
})

/**
 * Criação de conta. 3 contas novas por IP por hora.
 * Evita bot criando usuários em massa (spam, abuse).
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Muitas contas criadas deste IP. Aguarde 1 hora.',
  },
})
