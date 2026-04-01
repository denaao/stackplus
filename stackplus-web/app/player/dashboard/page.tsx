'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'

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
  }, [user])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault(); setJoinError('')
    try {
      await api.post('/home-games/join', { joinCode: joinCode.toUpperCase() })
      const { data } = await api.get('/home-games/member')
      setMemberships(data); setJoinCode('')
    } catch (err: any) { setJoinError(typeof err === 'string' ? err : 'Código inválido') }
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-black text-yellow-400">STACKPLUS</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400">{user?.name}</span>
          <button onClick={() => router.push('/profile')} className="text-sm text-zinc-400 hover:text-yellow-400 transition-colors">Perfil</button>
          <button onClick={() => { logout(); router.push('/') }} className="text-sm text-zinc-500 hover:text-red-400">Sair</button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Sessões', value: stats.totalSessions },
              { label: 'Vitórias', value: stats.wins },
              { label: 'Derrotas', value: stats.losses },
              { label: 'Resultado', value: `R$ ${stats.totalResult.toFixed(2)}`, color: stats.totalResult >= 0 ? 'text-green-400' : 'text-red-400' },
            ].map((s) => (
              <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wide">{s.label}</p>
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
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-sm uppercase font-mono focus:outline-none focus:border-yellow-400" />
            <button type="submit" className="bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold px-5 py-3 rounded-lg text-sm">Entrar</button>
          </form>
          {joinError && <p className="text-red-400 text-sm mt-2">{joinError}</p>}
        </div>

        <div>
          <h2 className="text-lg font-bold mb-4">Meus Home Games</h2>
          {memberships.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">Entre em um Home Game com o código</div>
          ) : (
            <div className="space-y-3">
              {memberships.map((m) => {
                const gameType = m.homeGame.gameType || 'CASH_GAME'
                return (
                <div key={m.id} className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-4 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold">{m.homeGame.name}</p>
                    <span className="rounded-full bg-zinc-800 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-300">
                      {gameType === 'CASH_GAME' ? 'Cash Game' : 'Torneio'}
                    </span>
                  </div>
                  <p className="text-zinc-400 text-sm">{m.homeGame.address}</p>
                  <p className="text-zinc-500 text-xs mt-1">{m.homeGame.dayOfWeek} • Host: {m.homeGame.host.name}</p>
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
