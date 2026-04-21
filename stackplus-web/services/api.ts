import axios, { AxiosError, AxiosRequestConfig } from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  headers: { 'Content-Type': 'application/json' },
})

// ─── Auth storage helpers ────────────────────────────────────────────────────
// Zustand persist guarda em localStorage no formato { state: {...}, version: N }.
// Aqui lemos/gravamos direto pra coordenar o interceptor com o store sem criar
// dependência circular.

type AuthKind = 'auth' | 'sangeur'

function storageKey(kind: AuthKind): string {
  return kind === 'sangeur' ? 'stackplus-sangeur-auth' : 'stackplus-auth'
}

function readStorage(kind: AuthKind): { token?: string | null; refreshToken?: string | null } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey(kind))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: { token?: string; refreshToken?: string } }
    return parsed.state ?? null
  } catch {
    return null
  }
}

function updateStorageTokens(kind: AuthKind, tokens: { token: string; refreshToken: string }) {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(storageKey(kind))
    const parsed = raw ? JSON.parse(raw) : { state: {}, version: 0 }
    parsed.state = { ...parsed.state, ...tokens }
    localStorage.setItem(storageKey(kind), JSON.stringify(parsed))
  } catch {
    // best-effort
  }
}

function resolveAuthKind(): AuthKind {
  if (typeof window === 'undefined') return 'auth'
  return window.location.pathname?.startsWith('/sangeur') ? 'sangeur' : 'auth'
}

function forceLogout(kind: AuthKind) {
  if (typeof window === 'undefined') return
  localStorage.removeItem(storageKey(kind))
  window.location.href = kind === 'sangeur' ? '/sangeur/login' : '/'
}

// ─── Request interceptor: injeta Bearer do storage correto ───────────────────

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    try {
      const path = window.location.pathname || ''
      const authStored = readStorage('auth')
      const sangeurStored = readStorage('sangeur')
      const authToken = authStored?.token
      const sangeurToken = sangeurStored?.token

      const token = path.startsWith('/sangeur')
        ? (sangeurToken || authToken)
        : (authToken || sangeurToken)

      if (token) config.headers.Authorization = `Bearer ${token}`
    } catch {}
  }
  return config
})

// ─── Refresh token coordination (SEC-004) ────────────────────────────────────
// Quando o access token expira e a API devolve 401, interceptamos a response,
// chamamos /auth/refresh com o refreshToken, atualizamos os tokens no storage
// e reenviamos o request original transparentemente.
//
// Concorrência: se vários requests caem em 401 ao mesmo tempo, só UMA chamada
// a /auth/refresh roda — os demais aguardam a mesma Promise e reusam o token
// novo. Evita rotações múltiplas e invalidação prematura de refresh tokens.

let refreshInFlight: Promise<string | null> | null = null

async function doRefresh(kind: AuthKind): Promise<string | null> {
  const stored = readStorage(kind)
  const refreshToken = stored?.refreshToken
  if (!refreshToken) return null

  try {
    // Usamos `axios` direto em vez de `api` pra evitar loop infinito caso
    // /auth/refresh devolva 401 (seria pego pelo próprio interceptor).
    const { data } = await axios.post(
      `${api.defaults.baseURL}/auth/refresh`,
      { refreshToken },
      { headers: { 'Content-Type': 'application/json' } },
    )
    if (data?.token && data?.refreshToken) {
      updateStorageTokens(kind, { token: data.token, refreshToken: data.refreshToken })
      return data.token as string
    }
    return null
  } catch {
    return null
  }
}

// ─── Response interceptor: refresh silencioso + fallback logout + normalize error ─

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalConfig = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined
    const status = error.response?.status
    const requestUrl = originalConfig?.url || ''
    const isAuthEndpoint = /\/auth\/(login|refresh|sangeur\/login)/.test(requestUrl)

    // 401 em request comum: tenta refresh silencioso (só 1x por request).
    if (
      status === 401 &&
      typeof window !== 'undefined' &&
      originalConfig &&
      !originalConfig._retried &&
      !isAuthEndpoint
    ) {
      const kind = resolveAuthKind()

      // Singleton: se já existe refresh rolando, reaproveita a Promise.
      if (!refreshInFlight) {
        refreshInFlight = doRefresh(kind).finally(() => {
          refreshInFlight = null
        })
      }
      const newToken = await refreshInFlight

      if (newToken) {
        originalConfig._retried = true
        originalConfig.headers = {
          ...(originalConfig.headers ?? {}),
          Authorization: `Bearer ${newToken}`,
        }
        return api.request(originalConfig)
      }

      // Refresh falhou → sessão expirada de verdade.
      forceLogout(kind)
    } else if (status === 401 && typeof window !== 'undefined' && !isAuthEndpoint) {
      // Já tentamos 1 retry ou sem refreshToken disponível.
      forceLogout(resolveAuthKind())
    }

    // Normaliza mensagem de erro pra consumer do api.
    const data = error.response?.data as
      | { error?: unknown; message?: unknown; details?: unknown }
      | string
      | undefined
    const details =
      data && typeof data === 'object' && Array.isArray(data.details)
        ? (data.details as unknown[])
            .map((item) => {
              if (!item) return null
              if (typeof item === 'string') return item
              if (typeof item !== 'object') return null
              const obj = item as { path?: unknown; message?: unknown }
              const path = typeof obj.path === 'string' ? obj.path : null
              const message = typeof obj.message === 'string' ? obj.message : null
              if (path && message) return `${path}: ${message}`
              return message
            })
            .filter(Boolean)
        : []

    const dataObj = data && typeof data === 'object' ? data : null
    const baseMessage =
      (dataObj && typeof dataObj.error === 'string' && dataObj.error) ||
      (dataObj && typeof dataObj.message === 'string' && dataObj.message) ||
      (typeof data === 'string' ? data : null) ||
      error.message ||
      'Erro desconhecido'

    const message = details.length > 0 ? `${baseMessage} | ${details.join(' | ')}` : baseMessage

    return Promise.reject(message)
  },
)

export default api
