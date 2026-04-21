import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  name: string
  cpf: string
  email?: string | null
  phone?: string | null
  pixType?: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM' | null
  pixKey?: string | null
  role: 'ADMIN' | 'HOST' | 'PLAYER' | 'CASHIER'
  avatarUrl?: string
}

interface PlayerState {
  userId: string
  sessionId: string
  chipsIn: number
  chipsOut: number
  currentStack: number
  result: number
  hasCashedOut: boolean
  user: { id: string; name: string; avatarUrl?: string }
}

interface Session {
  id: string
  homeGameId: string
  status: 'WAITING' | 'ACTIVE' | 'FINISHED'
  startedAt?: string
  finishedAt?: string
  homeGame: { name: string; chipValue: number }
  cashier?: { id: string; name: string }
}

interface AuthStore {
  token: string | null
  refreshToken: string | null
  user: User | null
  setAuth: (token: string, user: User, refreshToken?: string | null) => void
  setTokens: (token: string, refreshToken: string) => void
  setUser: (user: User) => void
  logout: () => void
}

interface SessionStore {
  session: Session | null
  playerStates: PlayerState[]
  setSession: (s: Session) => void
  setPlayerStates: (states: PlayerState[]) => void
  updatePlayerState: (state: PlayerState) => void
  clearSession: () => void
}

interface SangeurContext {
  homeGameId: string
  homeGameName: string
  username: string
  mustChangePassword: boolean
}

interface SangeurAuthStore {
  token: string | null
  user: User | null
  sangeur: SangeurContext | null
  setSangeurAuth: (token: string, user: User, sangeur: SangeurContext) => void
  setMustChangePassword: (mustChangePassword: boolean) => void
  logoutSangeur: () => void
}

// Best-effort POST /auth/logout. Revoga refresh tokens no backend.
// Usa fetch direto (não axios/api.ts) pra não criar dependência circular
// store <-> api e não disparar o interceptor de refresh.
function notifyLogoutBackend(token: string | null) {
  if (!token || typeof window === 'undefined') return
  const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
  // Fire-and-forget: se falhar, tokens continuam no DB até expirar naturalmente.
  fetch(`${baseURL}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    keepalive: true,
  }).catch(() => {})
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      // setAuth aceita refreshToken opcional pra retrocompat — se o backend
      // não enviar (ex.: endpoints antigos), mantém refreshToken atual.
      setAuth: (token, user, refreshToken) =>
        set((state) => ({
          token,
          user,
          refreshToken: refreshToken ?? state.refreshToken,
        })),
      setTokens: (token, refreshToken) => set({ token, refreshToken }),
      setUser: (user) => set((state) => ({ token: state.token, refreshToken: state.refreshToken, user })),
      logout: () => {
        // Avisa o backend pra revogar refresh tokens (SEC-004).
        notifyLogoutBackend(get().token)
        set({ token: null, refreshToken: null, user: null })
      },
    }),
    { name: 'stackplus-auth' }
  )
)

export const useSessionStore = create<SessionStore>((set) => ({
  session: null,
  playerStates: [],
  setSession: (session) => set({ session }),
  setPlayerStates: (playerStates) => set({ playerStates }),
  updatePlayerState: (updated) =>
    set((s) => ({
      playerStates: s.playerStates.map((p) =>
        p.userId === updated.userId ? updated : p
      ),
    })),
  clearSession: () => set({ session: null, playerStates: [] }),
}))

export const useSangeurAuthStore = create<SangeurAuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      sangeur: null,
      setSangeurAuth: (token, user, sangeur) => set({ token, user, sangeur }),
      setMustChangePassword: (mustChangePassword) =>
        set((state) => ({
          token: state.token,
          user: state.user,
          sangeur: state.sangeur ? { ...state.sangeur, mustChangePassword } : null,
        })),
      logoutSangeur: () => set({ token: null, user: null, sangeur: null }),
    }),
    { name: 'stackplus-sangeur-auth' }
  )
)
