import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  name: string
  email: string
  cpf?: string | null
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
  user: User | null
  setAuth: (token: string, user: User) => void
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

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      setUser: (user) => set((state) => ({ token: state.token, user })),
      logout: () => set({ token: null, user: null }),
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
