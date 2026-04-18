'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import api from '@/services/api'
import { io } from 'socket.io-client'

interface PlayerState {
  userId: string; result: string; chipsIn: string
  currentStack: string; hasCashedOut: boolean
  user: { id: string; name: string }
}

export default function TvPage() {
  const params = useParams()
  const sessionId = params.sessionId as string
  const [gameName, setGameName] = useState('')
  const [players, setPlayers] = useState<PlayerState[]>([])
  const [status, setStatus] = useState('')
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    api.get(`/sessions/public/${sessionId}`).then(({ data }) => {
      setGameName(data.homeGame.name)
      setStatus(data.status)
      setPlayers([...data.playerStates].sort((a, b) => parseFloat(b.result) - parseFloat(a.result)))
    }).catch(() => {})

    const socketBaseUrl = (process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/api\/?$/, '')
    const socket = io(socketBaseUrl, { transports: ['websocket'] })
    socket.emit('session:join', { sessionId, scope: 'public' })
    socket.on('ranking:updated', (ranking: PlayerState[]) => setPlayers([...ranking]))
    socket.on('session:finished', () => setStatus('FINISHED'))

    setNow(new Date())
    const clock = setInterval(() => setNow(new Date()), 1000)
    return () => { socket.disconnect(); clearInterval(clock) }
  }, [sessionId])

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-yellow-400 text-sm font-bold uppercase tracking-widest">STACKPLUS</p>
          <h1 className="text-4xl font-black text-white">{gameName}</h1>
        </div>
        <div className="text-right">
          <p className="text-zinc-400 text-sm">Ao vivo</p>
          <p className="text-2xl font-mono font-bold text-yellow-400" suppressHydrationWarning>
            {now
              ? now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : '--:--:--'}
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-3">
        {players.map((p, i) => {
          const result = parseFloat(p.result)
          const isPositive = result > 0
          const isNegative = result < 0
          return (
            <div key={p.userId} className={`flex items-center gap-6 rounded-2xl p-5 border transition-all ${i === 0 ? 'bg-yellow-400/10 border-yellow-400/40' : 'bg-zinc-900 border-zinc-800'}`}>
              <div className="w-14 text-center">
                {i < 3 ? (
                  <span className="text-3xl">{medals[i]}</span>
                ) : (
                  <span className="text-2xl font-black text-zinc-500">{i + 1}</span>
                )}
              </div>
              <div className="flex-1">
                <p className="text-2xl font-black">{p.user.name}</p>
                <p className="text-zinc-400 text-sm">Stack: {parseFloat(p.currentStack).toLocaleString('pt-BR')} fichas</p>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-black ${isPositive ? 'text-sx-cyan' : isNegative ? 'text-red-400' : 'text-zinc-400'}`}>
                  {isPositive ? '+' : ''}R$ {Math.abs(result).toFixed(2)}
                </p>
                <p className="text-zinc-500 text-sm">Inv: R$ {parseFloat(p.chipsIn).toFixed(2)}</p>
              </div>
              {p.hasCashedOut && (
                <div className="bg-zinc-700 text-zinc-300 text-xs font-bold px-3 py-1 rounded-full">CASHOUT</div>
              )}
            </div>
          )
        })}
        {players.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-zinc-600 text-2xl">Aguardando jogadores...</p>
          </div>
        )}
      </div>

      <div className="mt-6 text-center text-zinc-600 text-xs">
        STACKPLUS • Home Game Manager • {sessionId}
      </div>
    </div>
  )
}
