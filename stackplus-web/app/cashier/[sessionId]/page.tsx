'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'
import { joinSession, leaveSession, getSocket } from '@/services/socket'

interface Member { id: string; name: string }
interface PlayerState {
  userId: string; chipsIn: string; chipsOut: string
  currentStack: string; result: string; hasCashedOut: boolean
  user: { id: string; name: string }
}

export default function CashierPage() {
  const router = useRouter()
  const params = useParams()
  const sessionId = params.sessionId as string
  const [session, setSession] = useState<any>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [playerStates, setPlayerStates] = useState<PlayerState[]>([])
  const [form, setForm] = useState({ userId: '', type: 'BUYIN', amount: '', chips: '', note: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    api.get(`/sessions/${sessionId}`).then(({ data }) => {
      setSession(data)
      setPlayerStates(data.playerStates)
      return api.get(`/groups/${data.homeGameId}/members`)
    }).then(({ data }) => setMembers(data.map((m: any) => m.user)))

    joinSession(sessionId)
    const socket = getSocket()
    socket.on('transaction:new', ({ transaction, playerState }: { transaction: any; playerState: PlayerState }) => {
      setPlayerStates((prev) => {
        const exists = prev.find((p) => p.userId === playerState.userId)
        return exists ? prev.map((p) => p.userId === playerState.userId ? playerState : p) : [...prev, playerState]
      })
    })
    socket.on('ranking:updated', (ranking: PlayerState[]) => setPlayerStates(ranking))

    return () => { leaveSession(sessionId); socket.off('transaction:new'); socket.off('ranking:updated') }
  }, [sessionId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!form.userId) { setError('Selecione um jogador'); return }
    setLoading(true)
    try {
      await api.post('/cashier/transaction', {
        sessionId, userId: form.userId, type: form.type,
        amount: parseFloat(form.amount) || 0,
        chips: parseFloat(form.chips) || 0,
        note: form.note || undefined,
      })
      setSuccess('Transação registrada!')
      setForm({ userId: '', type: 'BUYIN', amount: '', chips: '', note: '' })
      setTimeout(() => setSuccess(''), 2000)
    } catch (err: any) {
      setError(typeof err === 'string' ? err : 'Erro ao registrar')
    } finally {
      setLoading(false)
    }
  }

  const chipValue = session ? parseFloat(session.homeGame.chipValue) : 1

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-zinc-400 hover:text-white">←</button>
        <div>
          <h1 className="font-bold">Caixa</h1>
          <p className="text-xs text-zinc-400">{session?.homeGame?.name}</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-lg font-bold mb-4">Registrar Transação</h2>
          <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
            {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>}
            {success && <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg p-3">{success}</div>}

            <div className="space-y-1">
              <label className="text-xs text-zinc-400 uppercase tracking-wide">Jogador</label>
              <select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-yellow-400">
                <option value="">Selecione...</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-400 uppercase tracking-wide">Tipo</label>
              <div className="grid grid-cols-2 gap-2">
                {['BUYIN', 'REBUY', 'ADDON', 'CASHOUT'].map((t) => (
                  <button key={t} type="button" onClick={() => setForm({ ...form, type: t })}
                    className={`py-2 rounded-lg text-sm font-bold transition-colors ${form.type === t ? 'bg-yellow-400 text-zinc-900' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {form.type !== 'CASHOUT' && (
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 uppercase tracking-wide">Valor (R$)</label>
                <input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" placeholder="0.00" />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs text-zinc-400 uppercase tracking-wide">Fichas</label>
              <input type="number" min="0" value={form.chips} onChange={(e) => setForm({ ...form, chips: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" placeholder="0" />
              {form.chips && chipValue && (
                <p className="text-xs text-zinc-400">≈ R$ {(parseFloat(form.chips) * chipValue).toFixed(2)}</p>
              )}
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold py-3 rounded-lg transition-colors disabled:opacity-50">
              {loading ? 'Registrando...' : 'Registrar'}
            </button>
          </form>
        </div>

        <div>
          <h2 className="text-lg font-bold mb-4">Jogadores</h2>
          <div className="space-y-3">
            {playerStates.length === 0 ? (
              <p className="text-zinc-500 text-sm">Nenhum jogador ainda</p>
            ) : (
              [...playerStates].sort((a, b) => parseFloat(b.result) - parseFloat(a.result)).map((p) => (
                <div key={p.userId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">{p.user.name}</span>
                    {p.hasCashedOut && <span className="text-xs bg-zinc-700 text-zinc-400 px-2 py-0.5 rounded">Cashout</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div><p className="text-zinc-500">Investido</p><p className="font-bold">R$ {parseFloat(p.chipsIn).toFixed(2)}</p></div>
                    <div><p className="text-zinc-500">Stack</p><p className="font-bold">{parseFloat(p.currentStack).toLocaleString()}</p></div>
                    <div><p className="text-zinc-500">Resultado</p>
                      <p className={`font-bold ${parseFloat(p.result) > 0 ? 'text-green-400' : parseFloat(p.result) < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                        {parseFloat(p.result) > 0 ? '+' : ''}R$ {parseFloat(p.result).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
