import { describe, expect, it } from 'vitest'
import { loginLimiter, registerLimiter } from '../../src/middlewares/rate-limit.middleware'

/**
 * Smoke test do rate-limit middleware (SEC-005).
 * Valida apenas os exports — comportamento real é validado via script
 * manual no runbook pós-deploy, já que express-rate-limit precisa de
 * sequência de requests com state persistente (difícil de unit-testar
 * sem spin-up de Express real).
 */

describe('rate-limit middleware', () => {
  it('exports loginLimiter como middleware Express (req, res, next)', () => {
    expect(typeof loginLimiter).toBe('function')
    // Middlewares Express têm aridade 3 (req, res, next)
    expect(loginLimiter.length).toBe(3)
  })

  it('exports registerLimiter como middleware Express', () => {
    expect(typeof registerLimiter).toBe('function')
    expect(registerLimiter.length).toBe(3)
  })
})
