import { z } from 'zod'

/**
 * Schema de senha para registro e troca de senha (SEC-010).
 *
 * Regras:
 *  - Mínimo 8, máximo 120 caracteres
 *  - Pelo menos 1 letra e 1 número
 *  - NÃO exige caractere especial nem caixa mista — NIST SP 800-63B desencoraja
 *    regras complexas obrigatórias porque levam usuários a padrões previsíveis.
 *
 * Validação só aplica em registro e troca — login ainda aceita qualquer tamanho
 * pra não bloquear usuários legacy com senha de 6 caracteres. Eles serão
 * forçados a atualizar na próxima troca de senha.
 */
export const passwordSchema = z
  .string()
  .min(8, 'A senha precisa de pelo menos 8 caracteres')
  .max(120, 'A senha é longa demais (máximo 120)')
  .regex(/[A-Za-z]/, 'A senha precisa ter pelo menos 1 letra')
  .regex(/\d/, 'A senha precisa ter pelo menos 1 número')
