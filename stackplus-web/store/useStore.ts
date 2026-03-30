import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  name: string
  email: string
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

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
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
