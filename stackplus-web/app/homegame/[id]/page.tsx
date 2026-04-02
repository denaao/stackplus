'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'

interface HomeGame {
  id: string; name: string; address: string; dayOfWeek: string
  gameType?: 'CASH_GAME' | 'TOURNAMENT'
  financialModule?: 'POSTPAID' | 'PREPAID' | 'HYBRID'
  startTime: string; chipValue: string; joinCode: string; rules?: string
  buyInAmount?: string
  rebuyAmount?: string
  addOnAmount?: string
  blindsMinutesBeforeBreak?: number
  blindsMinutesAfterBreak?: number
  levelsUntilBreak?: number
  host: { id: string; name: string }
  members: { id: string; paymentMode?: 'POSTPAID' | 'PREPAID' | null; user: { id: string; name: string } }[]
}

interface Session {
  id: string; status: string; startedAt?: string; finishedAt?: string; createdAt: string
  pokerVariant?: 'HOLDEN' | 'BUTTON_CHOICE' | 'PINEAPPLE' | 'OMAHA' | 'OMAHA_FIVE' | 'OMAHA_SIX'
  gameType?: 'CASH_GAME' | 'TOURNAMENT'
  financialModule?: 'POSTPAID' | 'PREPAID' | 'HYBRID'
  _count: { playerStates: number; transactions: number }
}

const pokerVariantOptions = [
  { value: 'HOLDEN', label: 'Holden' },
  { value: 'BUTTON_CHOICE', label: 'Button Choice' },
  { value: 'PINEAPPLE', label: 'Pineapple' },
  { value: 'OMAHA', label: 'Omaha' },
  { value: 'OMAHA_FIVE', label: 'Omaha Five' },
  { value: 'OMAHA_SIX', label: 'Omaha Six' },
] as const

export default function HomeGamePage() {
  const router = useRouter()
  const params = useParams()
  const user = useAuthStore((s) => s.user)
  const id = params.id as string
  const [game, setGame] = useState<HomeGame | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreatePicker, setShowCreatePicker] = useState(false)
  const [pokerVariant, setPokerVariant] = useState<'HOLDEN' | 'BUTTON_CHOICE' | 'PINEAPPLE' | 'OMAHA' | 'OMAHA_FIVE' | 'OMAHA_SIX'>('HOLDEN')
  const [newSessionType, setNewSessionType] = useState<'CASH_GAME' | 'TOURNAMENT'>('CASH_GAME')
  const [cashChipValue, setCashChipValue] = useState('1')
  const [cashSmallBlind, setCashSmallBlind] = useState('1')
  const [cashBigBlind, setCashBigBlind] = useState('2')
  const [cashMinimumBuyIn, setCashMinimumBuyIn] = useState('0')
  const [cashMinimumStayMinutes, setCashMinimumStayMinutes] = useState('0')
  const [cashFoodFee, setCashFoodFee] = useState('0')
  const [tourBuyInAmount, setTourBuyInAmount] = useState('0')
  const [tourRebuyAmount, setTourRebuyAmount] = useState('0')
  const [tourAddOnAmount, setTourAddOnAmount] = useState('0')
  const [tourBlindsBeforeBreak, setTourBlindsBeforeBreak] = useState('15')
  const [tourBlindsAfterBreak, setTourBlindsAfterBreak] = useState('20')
  const [tourLevelsUntilBreak, setTourLevelsUntilBreak] = useState('4')
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [newSessionFinancialModule, setNewSessionFinancialModule] = useState<'POSTPAID' | 'PREPAID' | 'HYBRID'>('POSTPAID')

  useEffect(() => {
    Promise.all([
      api.get(`/home-games/${id}`),
      api.get(`/sessions/home-game/${id}`)
    ]).then(([g, s]) => {
      setGame(g.data)
      setNewSessionFinancialModule(g.data.financialModule || 'POSTPAID')
      setSessions(s.data)
    }).finally(() => setLoading(false))
  }, [id])

  function openCreatePicker() {
    if (!game) return
    setPokerVariant('HOLDEN')
    setNewSessionType('CASH_GAME')
    setNewSessionFinancialModule(game.financialModule || 'POSTPAID')
    setCashChipValue(String(game.chipValue || '1'))
    setCashSmallBlind('1')
    setCashBigBlind('2')
    setCashMinimumBuyIn('0')
    setCashMinimumStayMinutes('0')
    setCashFoodFee('0')
    setTourBuyInAmount(String(game.buyInAmount ?? '0'))
    setTourRebuyAmount(String(game.rebuyAmount ?? '0'))
    setTourAddOnAmount(String(game.addOnAmount ?? '0'))
    setTourBlindsBeforeBreak(String(game.blindsMinutesBeforeBreak ?? '15'))
    setTourBlindsAfterBreak(String(game.blindsMinutesAfterBreak ?? '20'))
    setTourLevelsUntilBreak(String(game.levelsUntilBreak ?? '4'))
    setShowCreatePicker(true)
  }

  async function createSession() {
    setCreating(true)
    try {
      let payload: Record<string, string | number> = {
        homeGameId: id,
        pokerVariant,
        gameType: newSessionType,
        financialModule: newSessionFinancialModule,
      }

      if (newSessionType === 'CASH_GAME') {
        const chipValue = parseFloat(cashChipValue)
        const smallBlind = parseFloat(cashSmallBlind)
        const bigBlind = parseFloat(cashBigBlind)
        const minimumBuyIn = parseFloat(cashMinimumBuyIn)
        const minimumStayMinutes = parseInt(cashMinimumStayMinutes, 10)
        const foodFee = parseFloat(cashFoodFee)

        if (!(chipValue > 0)) {
          alert('Informe um valor/ficha valido para o cash game')
          return
        }
        if (!(smallBlind >= 0) || !(bigBlind > 0) || bigBlind < smallBlind) {
          alert('Informe blinds validos para o cash game')
          return
        }
        if (!(minimumBuyIn >= 0) || !(minimumStayMinutes >= 0) || !(foodFee >= 0)) {
          alert('Minimo de entrada, permanencia e taxa de alimentacao devem ser maiores ou iguais a zero')
          return
        }

        payload = {
          ...payload,
          chipValue,
          smallBlind,
          bigBlind,
          minimumBuyIn,
          minimumStayMinutes,
          foodFee,
        }
      } else {
        const buyInAmount = parseFloat(tourBuyInAmount)
        const rebuyAmount = parseFloat(tourRebuyAmount)
        const addOnAmount = parseFloat(tourAddOnAmount)
        const blindsMinutesBeforeBreak = parseInt(tourBlindsBeforeBreak, 10)
        const blindsMinutesAfterBreak = parseInt(tourBlindsAfterBreak, 10)
        const levelsUntilBreak = parseInt(tourLevelsUntilBreak, 10)

        if (!(buyInAmount > 0)) {
          alert('Informe um buy-in valido para o torneio')
          return
        }
        if (!(rebuyAmount >= 0) || !(addOnAmount >= 0)) {
          alert('Rebuy e add-on devem ser maiores ou iguais a zero')
          return
        }
        if (!(blindsMinutesBeforeBreak > 0) || !(blindsMinutesAfterBreak > 0) || !(levelsUntilBreak > 0)) {
          alert('Estrutura do torneio invalida. Verifique os tempos e niveis')
          return
        }

        payload = {
          ...payload,
          buyInAmount,
          rebuyAmount,
          addOnAmount,
          blindsMinutesBeforeBreak,
          blindsMinutesAfterBreak,
          levelsUntilBreak,
        }
      }

      const { data } = await api.post('/sessions', payload)
      setShowCreatePicker(false)
      router.push(`/session/${data.id}/manage`)
    } finally {
      setCreating(false)
    }
  }

  async function cancelSession(sessionId: string) {
    if (!confirm('Cancelar esta partida e remover todos os dados vinculados? Esta ação não pode ser desfeita.')) return
    setDeletingSessionId(sessionId)
    try {
      await api.delete(`/sessions/${sessionId}`)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    } catch (err) {
      const message = typeof err === 'string' ? err : 'Nao foi possivel cancelar a partida'
      alert(message)
    } finally {
      setDeletingSessionId(null)
    }
  }

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-yellow-400 text-2xl font-black">STACKPLUS</div></div>
  if (!game) return null
  const gameType = game.gameType || 'CASH_GAME'
  const isHost = user?.id === game.host.id

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
          <h1 className="font-bold text-lg flex items-center gap-2">
            {game.name}
            <span className="text-xs font-normal text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full">{game.members.length} membros</span>
          </h1>
          <p className="text-xs text-zinc-400">{game.address}</p>
        </div>
        <div className="ml-auto">
          <span className="bg-zinc-800 text-yellow-400 font-mono font-bold px-3 py-1 rounded text-sm">{game.joinCode}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold">Sessões</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Aqui voce define a modalidade da partida: Cash Game ou Torneio, ao criar uma nova partida.
              </p>
            </div>
            <button
              onClick={openCreatePicker}
              disabled={creating || !isHost}
              className="bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
              {creating ? 'Criando...' : '+ Nova Partida'}
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
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {pokerVariantOptions.find((option) => option.value === (s.pokerVariant || 'HOLDEN'))?.label || 'Holden'} • {s._count.playerStates} jogadores • {s._count.transactions} transações
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-zinc-800 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-300">
                      {(s.gameType || 'CASH_GAME') === 'CASH_GAME' ? 'Cash Game' : 'Torneio'}
                    </span>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${statusColors[s.status]}`}>
                      {statusLabel[s.status]}
                    </span>
                    {isHost && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          cancelSession(s.id)
                        }}
                        disabled={deletingSessionId === s.id}
                        className="bg-red-500/15 border border-red-500/40 hover:bg-red-500/25 text-red-300 text-xs font-bold px-3 py-1 rounded transition-colors disabled:opacity-50"
                      >
                        {deletingSessionId === s.id ? 'Cancelando...' : 'Cancelar partida'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>

      {showCreatePicker && isHost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6">
            <h3 className="text-lg font-bold">Nova Partida</h3>
            <p className="mt-1 text-sm text-zinc-400">Escolha o tipo da partida e preencha a configuracao.</p>

            <div className="mt-5 rounded-xl border border-zinc-700 bg-zinc-800/50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Módulo financeiro</p>
              <p className="mt-1 text-xs text-zinc-500">Define como as cobranças serão tratadas nesta partida.</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { key: 'POSTPAID', label: 'Pós-pago' },
                  { key: 'PREPAID', label: 'Pré-pago' },
                  { key: 'HYBRID', label: 'Híbrido' },
                ].map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setNewSessionFinancialModule(option.key as 'POSTPAID' | 'PREPAID' | 'HYBRID')}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${
                      newSessionFinancialModule === option.key
                        ? 'border-yellow-400 bg-yellow-400/15 text-yellow-300'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setNewSessionType('CASH_GAME')}
                className={`rounded-xl border px-4 py-3 text-sm font-bold transition-colors ${
                  newSessionType === 'CASH_GAME'
                    ? 'border-yellow-400 bg-yellow-400/15 text-yellow-300'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                Cash Game
              </button>
              <button
                type="button"
                onClick={() => setNewSessionType('TOURNAMENT')}
                className={`rounded-xl border px-4 py-3 text-sm font-bold transition-colors ${
                  newSessionType === 'TOURNAMENT'
                    ? 'border-yellow-400 bg-yellow-400/15 text-yellow-300'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                Torneio
              </button>
            </div>

            {newSessionType === 'CASH_GAME' ? (
              <div className="mt-4 grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 uppercase tracking-wide">Modalidade</label>
                  <select
                    value={pokerVariant}
                    onChange={(e) => setPokerVariant(e.target.value as 'HOLDEN' | 'BUTTON_CHOICE' | 'PINEAPPLE' | 'OMAHA' | 'OMAHA_FIVE' | 'OMAHA_SIX')}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none"
                  >
                    {pokerVariantOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 uppercase tracking-wide">Valor da ficha (R$)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={cashChipValue}
                    onChange={(e) => setCashChipValue(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 uppercase tracking-wide">Small blind (R$)</label>
                    <input type="number" min="0" step="0.01" value={cashSmallBlind} onChange={(e) => setCashSmallBlind(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 uppercase tracking-wide">Big blind (R$)</label>
                    <input type="number" min="0.01" step="0.01" value={cashBigBlind} onChange={(e) => setCashBigBlind(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 uppercase tracking-wide">Minimo entrada (R$)</label>
                    <input type="number" min="0" step="0.01" value={cashMinimumBuyIn} onChange={(e) => setCashMinimumBuyIn(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 uppercase tracking-wide">Min. permanencia (min)</label>
                    <input type="number" min="0" step="1" value={cashMinimumStayMinutes} onChange={(e) => setCashMinimumStayMinutes(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 uppercase tracking-wide">Taxa alimentacao (R$)</label>
                    <input type="number" min="0" step="0.01" value={cashFoodFee} onChange={(e) => setCashFoodFee(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 uppercase tracking-wide">Buy-in (R$)</label>
                    <input type="number" min="0" step="0.01" value={tourBuyInAmount} onChange={(e) => setTourBuyInAmount(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 uppercase tracking-wide">Rebuy (R$)</label>
                    <input type="number" min="0" step="0.01" value={tourRebuyAmount} onChange={(e) => setTourRebuyAmount(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 uppercase tracking-wide">Add-on (R$)</label>
                    <input type="number" min="0" step="0.01" value={tourAddOnAmount} onChange={(e) => setTourAddOnAmount(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 uppercase tracking-wide">Blind pre-break (min)</label>
                    <input type="number" min="1" step="1" value={tourBlindsBeforeBreak} onChange={(e) => setTourBlindsBeforeBreak(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 uppercase tracking-wide">Blind pos-break (min)</label>
                    <input type="number" min="1" step="1" value={tourBlindsAfterBreak} onChange={(e) => setTourBlindsAfterBreak(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 uppercase tracking-wide">Niveis ate break</label>
                    <input type="number" min="1" step="1" value={tourLevelsUntilBreak} onChange={(e) => setTourLevelsUntilBreak(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none" />
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreatePicker(false)}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={createSession}
                disabled={creating}
                className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-bold text-zinc-900 hover:bg-yellow-300 disabled:opacity-50"
              >
                {creating ? 'Criando...' : 'Criar Partida'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
