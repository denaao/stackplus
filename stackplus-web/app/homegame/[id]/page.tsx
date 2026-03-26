'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'

interface HomeGame {
  id: string; name: string; address: string; dayOfWeek: string
  startTime: string; chipValue: string; joinCode: string; rules?: string
  host: { id: string; name: string }
  members: { id: string; user: { id: string; name: string } }[]
}

interface Session {
  id: string; status: string; startedAt?: string; finishedAt?: string; createdAt: string
  _count: { playerStates: number; transactions: number }
}

export default function HomeGamePage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const [game, setGame] = useState<HomeGame | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get(`/home-games/${id}`),
      api.get(`/sessions/home-game/${id}`)
    ]).then(([g, s]) => {
      setGame(g.data)
      setSessions(s.data)
    }).finally(() => setLoading(false))
  }, [id])

  async function createSession() {
    setCreating(true)
    try {
      const { data } = await api.post('/sessions', { homeGameId: id })
      router.push(`/session/${data.id}/manage`)
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-yellow-400 text-2xl font-black">STACKPLUS</div></div>
  if (!game) return null

  const statusColors: Record<string, string> = {
    WAITING: 'text-yellow-400 bg-yellow-400/10',
    ACTIVE: 'text-green-400 bg-green-400/10',
    FINISHED: 'text-zinc-400 bg-zinc-400/10',
  }
  const statusLabel: Record<string, string> = { WAITING: 'Aguardando', ACTIVE: 'Ativa', FINISHED: 'Finalizada' }

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-zinc-400 hover:text-white">←</button>
        <div>
          <h1 className="font-bold text-lg">{game.name}</h1>
          <p className="text-xs text-zinc-400">{game.address}</p>
        </div>
        <div className="ml-auto">
          <span className="bg-zinc-800 text-yellow-400 font-mono font-bold px-3 py-1 rounded text-sm">{game.joinCode}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Dia', value: game.dayOfWeek },
            { label: 'Horário', value: game.startTime },
            { label: 'Valor/ficha', value: `R$ ${game.chipValue}` },
            { label: 'Membros', value: game.members.length },
          ].map((item) => (
            <div key={item.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">{item.label}</p>
              <p className="text-lg font-bold mt-1">{item.value}</p>
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Sessões</h2>
            <button onClick={createSession} disabled={creating}
              className="bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
              {creating ? 'Criando...' : '+ Nova Sessão'}
            </button>
          </div>

          {sessions.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
              <p>Nenhuma sessão ainda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((s) => (
                <div key={s.id} onClick={() => router.push(`/session/${s.id}/manage`)}
                  className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-4 cursor-pointer flex items-center justify-between transition-colors">
                  <div>
                    <p className="text-sm font-medium">{new Date(s.createdAt).toLocaleDateString('pt-BR')}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{s._count.playerStates} jogadores • {s._count.transactions} transações</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${statusColors[s.status]}`}>
                    {statusLabel[s.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-bold mb-4">Membros ({game.members.length})</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {game.members.map((m) => (
              <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-yellow-400/20 flex items-center justify-center text-yellow-400 text-sm font-bold">
                  {m.user.name[0].toUpperCase()}
                </div>
                <span className="text-sm font-medium truncate">{m.user.name}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
