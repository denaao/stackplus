'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'

interface HomeGame {
  id: string
  name: string
  address: string
  dayOfWeek: string
  startTime: string
  chipValue: string
  joinCode: string
  _count: { members: number; sessions: number }
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [games, setGames] = useState<HomeGame[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { router.push('/'); return }
    api.get('/home-games/mine').then(({ data }) => setGames(data)).finally(() => setLoading(false))
  }, [user])

  function handleLogout() {
    logout()
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-black text-yellow-400">STACKPLUS</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400">{user?.name}</span>
          <button onClick={handleLogout} className="text-sm text-zinc-500 hover:text-red-400 transition-colors">Sair</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold">Meus Home Games</h2>
            <p className="text-zinc-400 text-sm mt-1">Gerencie seus torneios</p>
          </div>
          <button onClick={() => router.push('/homegame/create')}
            className="bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold px-5 py-2.5 rounded-lg text-sm transition-colors">
            + Novo Home Game
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 animate-pulse h-40" />
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            <p className="text-5xl mb-4">♠</p>
            <p className="text-lg font-medium">Nenhum Home Game criado</p>
            <p className="text-sm mt-1">Crie seu primeiro para começar</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {games.map((game) => (
              <div key={game.id} onClick={() => router.push(`/homegame/${game.id}`)}
                className="bg-zinc-900 border border-zinc-800 hover:border-yellow-400/40 rounded-xl p-6 cursor-pointer transition-all group">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-bold text-lg group-hover:text-yellow-400 transition-colors">{game.name}</h3>
                  <span className="bg-zinc-800 text-yellow-400 text-xs font-mono font-bold px-2 py-1 rounded">{game.joinCode}</span>
                </div>
                <p className="text-zinc-400 text-sm mb-1">📍 {game.address}</p>
                <p className="text-zinc-400 text-sm mb-4">🕐 {game.dayOfWeek} às {game.startTime}</p>
                <div className="flex gap-4 text-sm text-zinc-500">
                  <span>👥 {game._count.members} membros</span>
                  <span>🎮 {game._count.sessions} sessões</span>
                  <span>💵 R$ {game.chipValue}/ficha</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
