import { describe, expect, it } from 'vitest'
import {
  loginLimiter,
  registerLimiter,
  webhookLimiter,
  passwordChangeLimiter,
  pixOutLimiter,
  destructiveLimiter,
  settleLimiter,
} from '../../src/middlewares/rate-limit.middleware'

/**
 * Smoke test do rate-limit middleware (SEC-005).
 * Valida apenas os exports — comportamento real é validado via script
 * manual no runbook pós-deploy, já que express-rate-limit precisa de
 * sequência de requests com state persistente (difícil de unit-testar
 * sem spin-up de Express real).
 */

describe('rate-limit middleware', () => {
  const limiters = {
    loginLimiter,
    registerLimiter,
    webhookLimiter,
    passwordChangeLimiter,
    pixOutLimiter,
    destructiveLimiter,
    settleLimiter,
  }

  for (const [name, limiter] of Object.entries(limiters)) {
    it(`exports ${name} como middleware Express (req, res, next)`, () => {
      expect(typeof limiter).toBe('function')
      // Middlewares Express têm aridade 3 (req, res, next)
      expect(limiter.length).toBe(3)
    })
  }
})
