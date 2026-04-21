/**
 * Helper para extrair mensagem de erro de forma type-safe.
 *
 * O interceptor do axios em services/api.ts já rejeita com uma string
 * pronta (combinando data.error + details). Mas pode haver casos em que
 * o erro ainda seja o axios error raw (fora do interceptor), um Error
 * nativo, ou qualquer outra coisa. Esta função cobre todos os casos.
 *
 * Uso típico:
 *   try { await api.post(...) }
 *   catch (err) { setError(getErrorMessage(err, 'Falha ao salvar')) }
 */
export function getErrorMessage(err: unknown, fallback = 'Erro desconhecido'): string {
  // 1. String direta (interceptor do axios já rejeita assim)
  if (typeof err === 'string') return err

  // 2. Axios error raw: err.response.data.{error,message}
  if (err && typeof err === 'object') {
    const anyErr = err as {
      response?: { data?: { error?: unknown; message?: unknown } }
      message?: unknown
    }

    const respError = anyErr.response?.data?.error
    if (typeof respError === 'string' && respError.trim()) return respError

    const respMessage = anyErr.response?.data?.message
    if (typeof respMessage === 'string' && respMessage.trim()) return respMessage

    // 3. Error nativo (new Error('...').message)
    if (typeof anyErr.message === 'string' && anyErr.message.trim()) return anyErr.message
  }

  return fallback
}

/**
 * Extrai statusCode e payload bruto de erro axios, pra uso em páginas de
 * debug/diagnóstico. Retorna undefined se o erro não tem esses campos.
 */
export function getAxiosErrorDetails(err: unknown): {
  statusCode: number | undefined
  payload: unknown
} {
  if (err && typeof err === 'object') {
    const anyErr = err as {
      response?: { status?: number; data?: unknown }
      message?: unknown
    }
    return {
      statusCode: anyErr.response?.status,
      payload: anyErr.response?.data ?? anyErr.message ?? 'Erro desconhecido',
    }
  }
  return {
    statusCode: undefined,
    payload: err ?? 'Erro desconhecido',
  }
}
