'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'
import { joinSession, leaveSession } from '@/services/socket'
import { getSocket } from '@/services/socket'

interface Session {
  id: string; status: string; startedAt?: string
  homeGame: { name: string; chipValue: string }
  cashier?: { id: string; name: string }
  playerStates: PlayerState[]
}

interface PlayerState {
  userId: string; chipsIn: string; chipsOut: string
  currentStack: string; result: string; hasCashedOut: boolean
  user: { id: string; name: string }
}

export default function SessionManagePage() {
  const router = useRouter()
  const params = useParams()
  const sessionId = params.id as string
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    api.get(`/sessions/${sessionId}`).then(({ data }) => setSession(data)).finally(() => setLoading(false))

    joinSession(sessionId)
    const socket = getSocket()

    socket.on('transaction:new', ({ playerState }: { playerState: PlayerState }) => {
      setSession((prev) => {
        if (!prev) return prev
        const exists = prev.playerStates.find((p) => p.userId === playerState.userId)
        return {
          ...prev,
          playerStates: exists
            ? prev.playerStates.map((p) => p.userId === playerState.userId ? playerState : p)
            : [...prev.playerStates, playerState],
        }
      })
    })

    socket.on('ranking:updated', (ranking: PlayerState[]) => {
      setSession((prev) => prev ? { ...prev, playerStates: ranking } : prev)
    })

    return () => {
      leaveSession(sessionId)
      socket.off('transaction:new')
      socket.off('ranking:updated')
    }
  }, [sessionId])

  async function startSession() {
    setActionLoading(true)
    try {
      const { data } = await api.patch(`/sessions/${sessionId}/start`, {})
      setSession(data)
    } finally {
      setActionLoading(false)
    }
  }

  async function finishSession() {
    if (!confirm('Finalizar sessão? Esta ação não pode ser desfeita.')) return
    setActionLoading(true)
    try {
      await api.patch(`/sessions/${sessionId}/finish`, {})
      router.back()
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-yellow-400 font-black text-2xl">STACKPLUS</div>
  if (!session) return null

  const sortedPlayers = [...session.playerStates].sort((a, b) => parseFloat(b.result) - parseFloat(a.result))

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-zinc-400 hover:text-white">←</button>
        <div className="flex-1">
          <h1 className="font-bold">{session.homeGame.name}</h1>
          <p className="text-xs text-zinc-400">Gerenciar Sessão</p>
        </div>
        <div className="flex gap-2">
          {session.status === 'WAITING' && (
            <button onClick={startSession} disabled={actionLoading}
              className="bg-green-500 hover:bg-green-400 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
              Iniciar
            </button>
          )}
          {session.status === 'ACTIVE' && (
            <>
              <button onClick={() => router.push(`/cashier/${sessionId}`)}
                className="bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold px-4 py-2 rounded-lg text-sm transition-colors">
                Caixa
              </button>
              <button onClick={() => window.open(`/tv/${sessionId}`, '_blank')}
                className="bg-zinc-700 hover:bg-zinc-600 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors">
                📺 TV
              </button>
              <button onClick={finishSession} disabled={actionLoading}
                className="bg-red-500 hover:bg-red-400 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
                Finalizar
              </button>
            </>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="space-y-3">
          <h2 className="text-lg font-bold">Ranking em Tempo Real</h2>
          {sortedPlayers.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
              Aguardando buy-ins...
            </div>
          ) : (
            sortedPlayers.map((p, i) => {
              const result = parseFloat(p.result)
              const isPositive = result > 0
              return (
                <div key={p.userId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${i === 0 ? 'bg-yellow-400 text-zinc-900' : i === 1 ? 'bg-zinc-400 text-zinc-900' : i === 2 ? 'bg-amber-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{p.user.name}</p>
                    <p className="text-xs text-zinc-400">Stack: {parseFloat(p.currentStack).toLocaleString()} fichas</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${isPositive ? 'text-green-400' : result < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                      {isPositive ? '+' : ''}R$ {result.toFixed(2)}
                    </p>
                    <p className="text-xs text-zinc-400">Inv: R$ {parseFloat(p.chipsIn).toFixed(2)}</p>
                  </div>
                  {p.hasCashedOut && <span className="text-xs bg-zinc-700 text-zinc-400 px-2 py-0.5 rounded">Cashout</span>}
                </div>
              )
            })
          )}
        </div>
      </main>
    </div>
  )
}
