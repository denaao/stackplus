/**
 * Utilitários para parsing type-safe de payloads externos (ex.: respostas da
 * ANNAPAY onde o formato varia entre endpoints). Padrão: receber `unknown`,
 * navegar por path e extrair strings / números, com fallback null.
 *
 * Espelha o getStringByPaths do backend (src/modules/banking/annapay.service.ts).
 */

type Path = string[]

/**
 * Navega um path dentro de um objeto desconhecido e retorna o valor bruto.
 * Retorna undefined se qualquer etapa do caminho não for um objeto.
 */
function traverse(payload: unknown, path: Path): unknown {
  let current: unknown = payload
  for (const key of path) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/**
 * Tenta extrair uma string não-vazia percorrendo uma lista de paths.
 * Retorna a primeira string não-vazia encontrada (com trim), ou null.
 */
export function getStringByPaths(payload: unknown, paths: Path[]): string | null {
  for (const path of paths) {
    const value = traverse(payload, path)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/**
 * Busca recursiva por uma string em qualquer profundidade do payload.
 * Útil pra `status`, `situacao` em respostas inconsistentes da ANNAPAY.
 * Retorna a primeira string não-vazia encontrada nas chaves listadas.
 */
export function findStringDeep(payload: unknown, keys: string[]): string | null {
  const stack: unknown[] = [payload]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || typeof current !== 'object') continue

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item)
      continue
    }

    const obj = current as Record<string, unknown>
    for (const key of keys) {
      const value = obj[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') stack.push(value)
    }
  }

  return null
}

/**
 * Checa recursivamente se algum objeto no payload tem uma das chaves listadas.
 * Útil pra detectar "tem endToEndId → PIX confirmado".
 */
export function hasAnyKeyDeep(payload: unknown, keys: string[]): boolean {
  const stack: unknown[] = [payload]
  const target = new Set(keys)

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || typeof current !== 'object') continue

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item)
      continue
    }

    const obj = current as Record<string, unknown>
    for (const key of Object.keys(obj)) {
      if (target.has(key)) return true
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') stack.push(value)
    }
  }

  return false
}
