'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'
import AppHeader from '@/components/AppHeader'

interface HomeGameMembership {
  id: string
  homeGame: { id: string; name: string; gameType?: 'CASH_GAME' | 'TOURNAMENT'; address: string; dayOfWeek: string; host: { name: string } }
}

export default function PlayerDashboardPage() {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [memberships, setMemberships] = useState<HomeGameMembership[]>([])
  const [stats, setStats] = useState<any>(null)
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { router.push('/'); return }
    Promise.all([
      api.get('/home-games/member'),
      api.get(`/users/${user.id}/stats`),
    ]).then(([m, s]) => { setMemberships(m.data); setStats(s.data) }).finally(() => setLoading(false))
  }, [user, router])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault(); setJoinError('')
    try {
      await api.post('/home-games/join', { joinCode: joinCode.toUpperCase() })
      const { data } = await api.get('/home-games/member')
      setMemberships(data); setJoinCode('')
    } catch (err: any) { setJoinError(typeof err === 'string' ? err : 'Código inválido') }
  }

  return (
    <div className="min-h-screen bg-sx-bg">
      <AppHeader
        userName={user?.name}
        onProfile={() => router.push('/profile')}
        onLogout={() => { logout(); router.push('/') }}
      />
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Sessões', value: stats.totalSessions },
              { label: 'Vitórias', value: stats.wins },
              { label: 'Derrotas', value: stats.losses },
              { label: 'Resultado', value: `R$ ${stats.totalResult.toFixed(2)}`, color: stats.totalResult >= 0 ? 'text-sx-cyan' : 'text-red-400' },
            ].map((s) => (
              <div key={s.label} className="bg-sx-card border border-sx-border rounded-xl p-4">
                <p className="text-xs text-sx-muted uppercase tracking-wide">{s.label}</p>
                <p className={`text-xl font-bold mt-1 ${(s as any).color || ''}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        <div>
          <h2 className="text-lg font-bold mb-4">Entrar em Home Game</h2>
          <form onSubmit={handleJoin} className="flex gap-3">
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={6}
              placeholder="Código (ex: ABC123)"
              className="flex-1 bg-sx-card border border-sx-border rounded-lg px-4 py-3 text-sm uppercase font-mono focus:outline-none focus:border-sx-cyan" />
            <button type="submit" className="bg-sx-cyan hover:bg-sx-cyan-dim text-sx-bg font-bold px-5 py-3 rounded-lg text-sm">Entrar</button>
          </form>
          {joinError && <p className="text-red-400 text-sm mt-2">{joinError}</p>}
        </div>

        <div>
          <h2 className="text-lg font-bold mb-4">Meus Home Games</h2>
          {memberships.length === 0 ? (
            <div className="text-center py-12 text-sx-muted border border-dashed border-sx-border rounded-xl">Entre em um Home Game com o código</div>
          ) : (
            <div className="space-y-3">
              {memberships.map((m) => {
                const gameType = m.homeGame.gameType || 'CASH_GAME'
                return (
                <div key={m.id} className="bg-sx-card border border-sx-border hover:border-sx-border2 rounded-xl p-4 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold">{m.homeGame.name}</p>
                    <span className="rounded-full bg-sx-input px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-300">
                      {gameType === 'CASH_GAME' ? 'Cash Game' : 'Torneio'}
                    </span>
                  </div>
                  <p className="text-sx-muted text-sm">{m.homeGame.address}</p>
                  <p className="text-sx-muted text-xs mt-1">{m.homeGame.dayOfWeek} • Host: {m.homeGame.host.name}</p>
                </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
