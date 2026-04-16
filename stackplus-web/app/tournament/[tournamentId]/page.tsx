'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import api from '@/services/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlindLevel { level: number; smallBlind: number; bigBlind: number; ante: number }

interface TournamentPlayer {
  id: string
  playerId: string
  status: 'REGISTERED' | 'ACTIVE' | 'ELIMINATED' | 'WINNER'
  position: number | null
  rebuysCount: number
  hasAddon: boolean
  bountyCollected: string
  prizeAmount: string | null
  eliminatedAtLevel: number | null
  eliminatedByPlayerId: string | null
  registeredAt: string
  comanda: { id: string; balance: string }
  player: { id: string; name: string; cpf: string }
  eliminatedBy?: { id: string; player: { id: string; name: string } } | null
}

interface Tournament {
  id: string
  name: string
  status: 'REGISTRATION' | 'RUNNING' | 'ON_BREAK' | 'FINISHED' | 'CANCELED'
  buyInAmount: string
  rebuyAmount: string | null
  addonAmount: string | null
  bountyAmount: string | null
  rake: string
  startingChips: number
  rebuyChips: number | null
  addonChips: number | null
  lateRegistrationLevel: number | null
  rebuyUntilLevel: number | null
  addonAfterLevel: number | null
  minutesPerLevelPreLateReg: number
  minutesPerLevelPostLateReg: number | null
  breaks: string | null
  currentLevel: number
  levelStartedAt: string | null
  isOnBreak: boolean
  breakStartedAt: string | null
  prizePool: string
  totalRake: string
  startedAt: string | null
  finishedAt: string | null
  homeGameId: string
  blindLevels: BlindLevel[]
  players: TournamentPlayer[]
}

interface PayoutSuggestion {
  prizePool: string
  suggestion: Array<{ position: number; amount: number; percent: number }>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: string | number) {
  return `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

function useTimer(levelStartedAt: string | null, minutesPerLevel: number, isOnBreak: boolean, breakStartedAt: string | null, breakDurationMinutes: number | null, pausedElapsed: number | null) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (pausedElapsed !== null) {
      setElapsed(pausedElapsed)
      return
    }
    const startStr = isOnBreak ? breakStartedAt : levelStartedAt
    if (!startStr) return
    const start = new Date(startStr).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [levelStartedAt, breakStartedAt, isOnBreak, pausedElapsed])

  const totalSeconds = (isOnBreak ? (breakDurationMinutes ?? 15) : minutesPerLevel) * 60
  const remaining = Math.max(0, totalSeconds - elapsed)
  const overTime = elapsed > totalSeconds

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')

  return { display: `${mm}:${ss}`, overTime, elapsed }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TournamentPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const router = useRouter()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [payout, setPayout] = useState<PayoutSuggestion | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPayout, setShowPayout] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [editingBlinds, setEditingBlinds] = useState(false)
  const [editLevels, setEditLevels] = useState<{ level: number; smallBlind: number; bigBlind: number; ante: number }[]>([])
  const [editBreaks, setEditBreaks] = useState<{ id: string; afterLevel: string; durationMinutes: string }[]>([])
  const [registeringPlayerId, setRegisteringPlayerId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [playerSearch, setPlayerSearch] = useState('')
  const [homeGameMembers, setHomeGameMembers] = useState<any[]>([])
  const [selectedTab, setSelectedTab] = useState<'playing' | 'eliminated'>('playing')
  const [eliminateModal, setEliminateModal] = useState<TournamentPlayer | null>(null)
  const [eliminatorId, setEliminatorId] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/tournaments/${tournamentId}`)
      setTournament(res.data)
      // Carrega membros do home game na primeira carga
      if (res.data.homeGameId && homeGameMembers.length === 0) {
        api.get(`/home-games/${res.data.homeGameId}`)
          .then((r) => setHomeGameMembers(r.data.members ?? []))
          .catch(() => {})
      }
    } catch {
      setError('Torneio não encontrado')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])

  useEffect(() => { load() }, [load])

  // Polling durante torneio em andamento
  useEffect(() => {
    if (!tournament || !['RUNNING', 'ON_BREAK'].includes(tournament.status)) return
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [tournament?.status, load])

  const action = async (fn: () => Promise<any>, key: string) => {
    setActionLoading(key)
    setError(null)
    try {
      await fn()
      await load()
    } catch (err: any) {
      setError(err.message || 'Erro')
    } finally {
      setActionLoading(null)
    }
  }

  const loadPayout = async () => {
    const res = await api.get(`/tournaments/${tournamentId}/payout-suggestion`)
    setPayout(res.data)
    setShowPayout(true)
  }

  const registerPlayer = async (playerId: string) => {
    setRegisteringPlayerId(playerId)
    await action(async () => {
      await api.post(`/tournaments/${tournamentId}/players`, {
        playerId,
        homeGameId: tournament!.homeGameId,
      })
      setShowRegister(false)
      setPlayerSearch('')
    }, 'register')
    setRegisteringPlayerId(null)
  }

  // Membros filtrados: remove quem já está inscrito no torneio
  const registeredPlayerIds = new Set(tournament?.players.map((p) => p.playerId) ?? [])
  const filteredMembers = homeGameMembers
    .filter((m: any) => !registeredPlayerIds.has(m.user?.id ?? m.userId))
    .filter((m: any) => {
      const name: string = m.user?.name ?? ''
      return name.toLowerCase().includes(playerSearch.toLowerCase())
    })

  if (loading) return (
    <div className="min-h-screen bg-[#2a3150] flex items-center justify-center">
      <div className="text-[#B7D9BF]/50">Carregando...</div>
    </div>
  )

  if (!tournament) return (
    <div className="min-h-screen bg-[#2a3150] flex items-center justify-center">
      <div className="text-red-400">{error}</div>
    </div>
  )

  const parsedBreaksMain: { afterLevel: number; durationMinutes: number }[] = (() => {
    try { return JSON.parse(tournament.breaks ?? '[]') } catch { return [] }
  })()
  const currentBreak = parsedBreaksMain.find((b) => b.afterLevel === tournament.currentLevel - 1)
  const minutesPerLevel = tournament.isOnBreak
    ? (currentBreak?.durationMinutes ?? 15)
    : (tournament.minutesPerLevelPostLateReg ?? tournament.minutesPerLevelPreLateReg)

  const currentBlind = tournament.blindLevels.find((b) => b.level === tournament.currentLevel)

  const activePlayers = tournament.players.filter((p) => ['REGISTERED', 'ACTIVE', 'WINNER'].includes(p.status))
  const eliminatedPlayers = tournament.players.filter((p) => p.status === 'ELIMINATED')
    .sort((a, b) => (b.eliminatedAtLevel ?? 0) - (a.eliminatedAtLevel ?? 0))

  const filtered = (list: TournamentPlayer[]) =>
    list.filter((p) => p.player.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const statusBadge: Record<string, string> = {
    REGISTRATION: 'bg-blue-900/40 text-blue-300 border border-blue-700',
    RUNNING: 'bg-green-900/40 text-green-300 border border-green-700',
    ON_BREAK: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700',
    FINISHED: 'bg-[#434c6b] text-[#B7D9BF]/80 border border-[#4a5475]',
    CANCELED: 'bg-red-900/40 text-red-400 border border-red-700',
  }

  const statusLabel: Record<string, string> = {
    REGISTRATION: 'Inscrições',
    RUNNING: 'Rodando',
    ON_BREAK: 'Intervalo',
    FINISHED: 'Finalizado',
    CANCELED: 'Cancelado',
  }

  return (
    <div className="min-h-screen bg-[#2a3150] text-white pb-8">

      {/* Header */}
      <div className="bg-[#39415C] border-b border-[#39415C] px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={() => router.back()} className="text-[#B7D9BF]/80 hover:text-white">←</button>
          <div className="flex-1">
            <h1 className="font-bold text-lg">{tournament.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge[tournament.status]}`}>
                {statusLabel[tournament.status]}
              </span>
              <span className="text-xs text-[#B7D9BF]/50">{tournament.players.length} inscritos</span>
            </div>
          </div>
          <a
            href={`/tournament/${tournamentId}/clock`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#B7D9BF]/80 hover:text-white px-3 py-1.5 bg-[#434c6b] hover:bg-[#4f5878] rounded-lg border border-[#4a5475] whitespace-nowrap"
          >
            📺 Clock
          </a>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-4">

        {error && (
          <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Timer */}
        {['RUNNING', 'ON_BREAK'].includes(tournament.status) && (
          <TimerCard
            tournament={tournament}
            currentBlind={currentBlind}
            onAdvance={() => action(() => api.post(`/tournaments/${tournamentId}/advance-level`), 'advance')}
            onBreak={() => action(() => api.post(`/tournaments/${tournamentId}/start-break`), 'break')}
            onEndBreak={() => action(() => api.post(`/tournaments/${tournamentId}/end-break`), 'endbreak')}
            actionLoading={actionLoading}
          />
        )}

        {/* Prize pool */}
        <div className="bg-[#39415C] rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#B7D9BF]/50 mb-1">Prize Pool</div>
            <div className="text-2xl font-bold text-green-400">{fmt(tournament.prizePool)}</div>
            {Number(tournament.totalRake) > 0 && (
              <div className="text-xs text-[#B7D9BF]/50 mt-0.5">Rake: {fmt(tournament.totalRake)}</div>
            )}
          </div>
          <button
            onClick={() => action(loadPayout, 'payout')}
            className="text-sm text-[#B7D9BF] hover:text-white border border-[#B7D9BF]/30 rounded-lg px-3 py-2"
          >
            Ver distribuição
          </button>
        </div>

        {/* Controls */}
        <div className="flex gap-2 flex-wrap items-center">
          {['REGISTRATION', 'RUNNING'].includes(tournament.status) && (
            <button
              onClick={() => setShowRegister(true)}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-medium"
            >
              + Inscrever Jogador
            </button>
          )}
          {tournament.status === 'REGISTRATION' && (
            <button
              onClick={() => action(() => api.post(`/tournaments/${tournamentId}/start`), 'start')}
              disabled={!!actionLoading || tournament.players.length < 2}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Iniciar Torneio
            </button>
          )}
          {tournament.status === 'RUNNING' && (
            <button
              onClick={() => setShowPayout(true)}
              className="px-4 py-2 bg-[#4f5878] hover:bg-[#5b6488] rounded-lg text-sm font-medium"
            >
              Pagar Prêmio
            </button>
          )}
          <div className="flex-1" />
          {['REGISTRATION', 'RUNNING', 'ON_BREAK'].includes(tournament.status) && (
            <button
              onClick={() => { if (confirm('Cancelar torneio?')) action(() => api.post(`/tournaments/${tournamentId}/cancel`), 'cancel') }}
              className="px-4 py-2 bg-red-900/50 hover:bg-red-900 border border-red-800 rounded-lg text-sm text-red-300"
            >
              Cancelar
            </button>
          )}
        </div>

        {/* Search */}
        <input
          className="w-full bg-[#434c6b] border border-[#4a5475] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#B7D9BF]"
          placeholder="Buscar jogador..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {/* Tabs */}
        <div className="flex border-b border-[#39415C]">
          <button
            onClick={() => setSelectedTab('playing')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${selectedTab === 'playing' ? 'border-[#B7D9BF] text-white' : 'border-transparent text-[#B7D9BF]/50 hover:text-[#B7D9BF]'}`}
          >
            Jogando ({activePlayers.length})
          </button>
          <button
            onClick={() => setSelectedTab('eliminated')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${selectedTab === 'eliminated' ? 'border-[#B7D9BF] text-white' : 'border-transparent text-[#B7D9BF]/50 hover:text-[#B7D9BF]'}`}
          >
            Eliminados ({eliminatedPlayers.length})
          </button>
        </div>

        {/* Player list */}
        <div className="space-y-2">
          {filtered(selectedTab === 'playing' ? activePlayers : eliminatedPlayers).map((p) => (
            <PlayerRow
              key={p.id}
              player={p}
              tournament={tournament}
              actionLoading={actionLoading}
              onRebuy={() => action(() => api.post(`/tournaments/players/${p.id}/rebuy`), `rebuy-${p.id}`)}
              onAddon={() => action(() => api.post(`/tournaments/players/${p.id}/addon`), `addon-${p.id}`)}
              onEliminate={() => { setEliminateModal(p); setEliminatorId('') }}
              onPrize={() => {
                const amount = prompt(`Prêmio para ${p.player.name} (R$):`)
                if (amount) action(() => api.post(`/tournaments/players/${p.id}/prize`, { prizeAmount: parseFloat(amount) }), `prize-${p.id}`)
              }}
            />
          ))}
          {filtered(selectedTab === 'playing' ? activePlayers : eliminatedPlayers).length === 0 && (
            <div className="text-center text-[#B7D9BF]/40 py-8 text-sm">
              {selectedTab === 'playing' ? 'Nenhum jogador inscrito' : 'Nenhum eliminado ainda'}
            </div>
          )}
        </div>

        {/* Blind structure */}
        {tournament.blindLevels.length > 0 && (() => {
          const parsedBreaks: { afterLevel: number; durationMinutes: number }[] = (() => {
            try { return JSON.parse((tournament as any).breaks ?? '[]') } catch { return [] }
          })()
          const breakMap = new Map(parsedBreaks.map((b) => [b.afterLevel, b.durationMinutes]))
          const mins = (tournament as any).minutesPerLevelPreLateReg ?? (tournament as any).minutesPerLevelPreBreak ?? 15
          return (
          <details className="bg-[#39415C] rounded-xl" open={editingBlinds || undefined}>
            <summary className="px-4 py-3 text-sm font-medium cursor-pointer flex items-center justify-between">
              <span>Estrutura de Blinds</span>
              {!editingBlinds && (
                <span
                  role="button"
                  onClick={(e) => {
                    e.preventDefault()
                    setEditLevels(tournament.blindLevels.map((l) => ({ ...l })))
                    setEditBreaks(parsedBreaks.map((b, i) => ({ id: String(i), afterLevel: String(b.afterLevel), durationMinutes: String(b.durationMinutes) })))
                    setEditingBlinds(true)
                  }}
                  className="text-xs text-[#B7D9BF] hover:text-white px-2 py-0.5 rounded"
                >
                  Editar
                </span>
              )}
            </summary>
            <div className="px-4 pb-4">
              {editingBlinds ? (
                <div className="space-y-3">
                  {/* Levels table */}
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[#B7D9BF]/50 border-b border-[#39415C]">
                        <th className="text-left py-1">Nível</th>
                        <th className="text-right py-1 px-1">SB</th>
                        <th className="text-right py-1 px-1">BB</th>
                        <th className="text-right py-1 px-1">Ante</th>
                        <th className="py-1 w-6"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editLevels.map((l, i) => (
                        <tr key={i} className="border-b border-[#39415C]/50">
                          <td className="py-1 text-[#B7D9BF]/80 pr-2">{l.level}</td>
                          <td className="py-1 px-1">
                            <input type="number" className="w-full bg-[#434c6b] border border-[#4a5475] rounded px-1.5 py-1 text-right focus:outline-none focus:border-[#B7D9BF] text-xs" value={l.smallBlind} onChange={(e) => setEditLevels((ls) => ls.map((x, idx) => idx === i ? { ...x, smallBlind: parseInt(e.target.value) || 0 } : x))} />
                          </td>
                          <td className="py-1 px-1">
                            <input type="number" className="w-full bg-[#434c6b] border border-[#4a5475] rounded px-1.5 py-1 text-right focus:outline-none focus:border-[#B7D9BF] text-xs" value={l.bigBlind} onChange={(e) => setEditLevels((ls) => ls.map((x, idx) => idx === i ? { ...x, bigBlind: parseInt(e.target.value) || 0 } : x))} />
                          </td>
                          <td className="py-1 px-1">
                            <input type="number" className="w-full bg-[#434c6b] border border-[#4a5475] rounded px-1.5 py-1 text-right focus:outline-none focus:border-[#B7D9BF] text-xs" value={l.ante} onChange={(e) => setEditLevels((ls) => ls.map((x, idx) => idx === i ? { ...x, ante: parseInt(e.target.value) || 0 } : x))} />
                          </td>
                          <td className="py-1 pl-1">
                            <button type="button" onClick={() => setEditLevels((ls) => ls.filter((_, idx) => idx !== i))} className="text-[#B7D9BF]/40 hover:text-red-400">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button type="button" onClick={() => { const last = editLevels[editLevels.length - 1]; setEditLevels((ls) => [...ls, { level: last.level + 1, smallBlind: last.bigBlind, bigBlind: last.bigBlind * 2, ante: last.ante }]) }} className="text-xs text-[#B7D9BF] hover:text-white">
                    + Nível
                  </button>

                  {/* Breaks editor */}
                  <div className="border-t border-[#39415C] pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-[#B7D9BF]/80">Intervalos</p>
                      <button type="button" onClick={() => setEditBreaks((bs) => [...bs, { id: Date.now().toString(), afterLevel: '', durationMinutes: '15' }])} className="text-xs text-[#B7D9BF] hover:text-white">
                        + Intervalo
                      </button>
                    </div>
                    {editBreaks.length === 0 && <p className="text-xs text-[#B7D9BF]/40">Nenhum intervalo configurado</p>}
                    <div className="space-y-2">
                      {editBreaks.map((b, i) => (
                        <div key={b.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                          <div>
                            <label className="block text-xs text-[#B7D9BF]/50 mb-1">Após nível</label>
                            <input type="number" className="w-full bg-[#434c6b] border border-[#4a5475] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#B7D9BF]" value={b.afterLevel} onChange={(e) => setEditBreaks((bs) => bs.map((x, idx) => idx === i ? { ...x, afterLevel: e.target.value } : x))} placeholder="Nível" />
                          </div>
                          <div>
                            <label className="block text-xs text-[#B7D9BF]/50 mb-1">Duração (min)</label>
                            <input type="number" className="w-full bg-[#434c6b] border border-[#4a5475] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#B7D9BF]" value={b.durationMinutes} onChange={(e) => setEditBreaks((bs) => bs.map((x, idx) => idx === i ? { ...x, durationMinutes: e.target.value } : x))} placeholder="15" />
                          </div>
                          <button type="button" onClick={() => setEditBreaks((bs) => bs.filter((_, idx) => idx !== i))} className="pb-1 text-[#B7D9BF]/40 hover:text-red-400">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={async () => {
                        const validBreaks = editBreaks.filter((b) => b.afterLevel).map((b) => ({ afterLevel: parseInt(b.afterLevel), durationMinutes: parseInt(b.durationMinutes) || 15 }))
                        await action(() => api.patch(`/tournaments/${tournamentId}/blind-levels`, { levels: editLevels, breaks: validBreaks }), 'blinds')
                        setEditingBlinds(false)
                      }}
                      disabled={!!actionLoading}
                      className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-medium disabled:opacity-50"
                    >
                      {actionLoading === 'blinds' ? 'Salvando...' : 'Salvar'}
                    </button>
                    <button onClick={() => setEditingBlinds(false)} className="px-4 py-2 bg-[#434c6b] hover:bg-[#4f5878] rounded-lg text-xs">Cancelar</button>
                  </div>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[#B7D9BF]/50 border-b border-[#39415C]">
                      <th className="text-left py-1">Nível</th>
                      <th className="text-right py-1">SB</th>
                      <th className="text-right py-1">BB</th>
                      <th className="text-right py-1">Ante</th>
                      <th className="text-right py-1">Tempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tournament.blindLevels.map((l) => {
                      const isCurrent = l.level === tournament.currentLevel
                      const breakAfterThis = breakMap.get(l.level)
                      return (
                        <Fragment key={l.level}>
                          <tr className={`border-b border-[#39415C]/50 ${isCurrent ? 'text-white font-semibold' : 'text-[#B7D9BF]/80'}`}>
                            <td className="py-1.5">{l.level}</td>
                            <td className="py-1.5 text-right">{l.smallBlind.toLocaleString()}</td>
                            <td className="py-1.5 text-right">{l.bigBlind.toLocaleString()}</td>
                            <td className="py-1.5 text-right">{l.ante > 0 ? l.ante.toLocaleString() : '—'}</td>
                            <td className="py-1.5 text-right text-[#B7D9BF]/50">{mins}min</td>
                          </tr>
                          {breakAfterThis !== undefined && (
                            <tr className="bg-yellow-900/20 border-b border-[#39415C]/50">
                              <td colSpan={5} className="py-1.5 text-center text-yellow-400 text-xs">
                                🕐 Intervalo — {breakAfterThis} minutos
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </details>
          )
        })()}
      </div>

      {/* Register modal */}
      {showRegister && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4">
          <div className="bg-[#39415C] rounded-2xl w-full max-w-md p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Inscrever Jogador</h3>
              <button onClick={() => { setShowRegister(false); setPlayerSearch('') }} className="text-[#B7D9BF]/50">✕</button>
            </div>
            <input
              className="w-full bg-[#434c6b] border border-[#4a5475] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#B7D9BF]"
              placeholder="Filtrar por nome..."
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              autoFocus
            />
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {filteredMembers.length === 0 ? (
                <div className="text-center text-[#B7D9BF]/40 py-6 text-sm">
                  {homeGameMembers.length === 0 ? 'Carregando membros...' : 'Todos os membros já estão inscritos'}
                </div>
              ) : filteredMembers.map((m: any) => {
                const u = m.user ?? m
                const isRegistering = registeringPlayerId === u.id
                return (
                  <button
                    key={u.id}
                    onClick={() => registerPlayer(u.id)}
                    disabled={!!actionLoading}
                    className="w-full text-left px-3 py-2 bg-[#434c6b] hover:bg-[#4f5878] rounded-lg text-sm flex items-center justify-between disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2">
                      {isRegistering && (
                        <svg className="animate-spin h-3.5 w-3.5 text-[#B7D9BF] shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                      )}
                      {u.name}
                    </span>
                    <span className="text-[#B7D9BF]/50 text-xs">{u.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Eliminate modal */}
      {eliminateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4">
          <div className="bg-[#39415C] rounded-2xl w-full max-w-md p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Eliminar {eliminateModal.player.name}</h3>
              <button onClick={() => setEliminateModal(null)} className="text-[#B7D9BF]/50">✕</button>
            </div>
            {tournament.bountyAmount && (
              <div>
                <label className="block text-xs text-[#B7D9BF]/80 mb-1">Quem eliminou? (bounty)</label>
                <select
                  className="w-full bg-[#434c6b] border border-[#4a5475] rounded-lg px-3 py-2 text-sm focus:outline-none"
                  value={eliminatorId}
                  onChange={(e) => setEliminatorId(e.target.value)}
                >
                  <option value="">Ninguém / Não registrar</option>
                  {activePlayers.filter((p) => p.id !== eliminateModal.id).map((p) => (
                    <option key={p.id} value={p.id}>{p.player.name}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              disabled={!!actionLoading}
              onClick={() => action(async () => {
                await api.post(`/tournaments/players/${eliminateModal.id}/eliminate`, {
                  eliminatedByPlayerId: eliminatorId || null,
                })
                setEliminateModal(null)
              }, `elim-${eliminateModal.id}`)}
              className="w-full py-3 bg-red-700 hover:bg-red-600 rounded-xl font-semibold text-sm disabled:opacity-50"
            >
              {actionLoading ? 'Processando...' : 'Confirmar Eliminação'}
            </button>
          </div>
        </div>
      )}

      {/* Payout modal */}
      {showPayout && payout && (
        <PayoutModal
          payout={payout}
          players={tournament.players}
          actionLoading={actionLoading}
          onClose={() => setShowPayout(false)}
          onPay={async (playerId, amount) => {
            await action(async () => {
              await api.post(`/tournaments/players/${playerId}/prize`, { prizeAmount: amount })
            }, `prize-${playerId}`)
          }}
        />
      )}
    </div>
  )
}

// ─── Timer Card ───────────────────────────────────────────────────────────────

function TimerCard({ tournament, currentBlind, onAdvance, onBreak, onEndBreak, actionLoading }: {
  tournament: Tournament
  currentBlind: BlindLevel | undefined
  onAdvance: () => void
  onBreak: () => void
  onEndBreak: () => void
  actionLoading: string | null
}) {
  const [breakPaused, setBreakPaused] = useState(false)
  const [pausedElapsed, setPausedElapsed] = useState<number | null>(null)

  const parsedBreaksTimer: { afterLevel: number; durationMinutes: number }[] = (() => {
    try { return JSON.parse(tournament.breaks ?? '[]') } catch { return [] }
  })()

  // Break scheduled after the CURRENT level (shown as button before advancing)
  const nextBreak = parsedBreaksTimer.find((b) => b.afterLevel === tournament.currentLevel)
  // Break that is currently active (started after previous level)
  const activeBreak = parsedBreaksTimer.find((b) => b.afterLevel === tournament.currentLevel - 1)
  const breakDuration = activeBreak?.durationMinutes ?? 15

  const minutesPerLevel = tournament.isOnBreak
    ? breakDuration
    : (tournament.minutesPerLevelPostLateReg ?? tournament.minutesPerLevelPreLateReg)

  const { display, overTime, elapsed } = useTimer(
    tournament.levelStartedAt,
    minutesPerLevel,
    tournament.isOnBreak,
    tournament.breakStartedAt,
    breakDuration,
    pausedElapsed,
  )

  // Reset pause when break state changes
  useEffect(() => {
    setBreakPaused(false)
    setPausedElapsed(null)
  }, [tournament.isOnBreak, tournament.breakStartedAt])

  const handlePauseBreak = () => {
    setPausedElapsed(elapsed)
    setBreakPaused(true)
  }
  const handleResumeBreak = () => {
    // Adjust breakStartedAt equivalent by shifting elapsed back
    setPausedElapsed(null)
    setBreakPaused(false)
  }

  return (
    <div className={`rounded-xl p-4 ${tournament.isOnBreak ? 'bg-yellow-900/30 border border-yellow-700' : 'bg-[#39415C]'}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          {tournament.isOnBreak ? (
            <>
              <div className="text-yellow-400 font-semibold text-sm">INTERVALO</div>
              <div className="text-xs text-yellow-600 mt-0.5">{breakDuration} minutos{breakPaused ? ' · pausado' : ''}</div>
            </>
          ) : (
            <>
              <div className="text-sm text-[#B7D9BF]/80">Nível {tournament.currentLevel}</div>
              {currentBlind && (
                <div className="text-xs text-[#B7D9BF]/50 mt-0.5">
                  SB {currentBlind.smallBlind.toLocaleString()} / BB {currentBlind.bigBlind.toLocaleString()}
                  {currentBlind.ante > 0 && ` / Ante ${currentBlind.ante.toLocaleString()}`}
                </div>
              )}
            </>
          )}
        </div>
        <div className={`text-4xl font-mono font-bold tabular-nums ${overTime ? 'text-red-400' : tournament.isOnBreak ? (breakPaused ? 'text-yellow-600' : 'text-yellow-400') : 'text-white'}`}>
          {overTime && !tournament.isOnBreak ? '+' : ''}{display}
        </div>
      </div>

      <div className="flex gap-2">
        {tournament.isOnBreak ? (
          <>
            <button
              onClick={breakPaused ? handleResumeBreak : handlePauseBreak}
              className={`px-4 py-2 rounded-lg text-sm font-medium border ${breakPaused ? 'bg-yellow-700/50 hover:bg-yellow-700 border-yellow-600 text-yellow-300' : 'bg-[#434c6b] hover:bg-[#4f5878] border-[#4a5475] text-[#B7D9BF]'}`}
            >
              {breakPaused ? '▶ Retomar' : '⏸ Pausar'}
            </button>
            <button
              onClick={onEndBreak}
              disabled={!!actionLoading}
              className="flex-1 py-2 bg-yellow-700 hover:bg-yellow-600 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Encerrar Intervalo
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onAdvance}
              disabled={!!actionLoading}
              className="flex-1 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Próximo Nível
            </button>
            {nextBreak && (
              <button
                onClick={onBreak}
                disabled={!!actionLoading}
                className="px-4 py-2 bg-yellow-700/50 hover:bg-yellow-700 border border-yellow-600 rounded-lg text-sm text-yellow-300 disabled:opacity-50"
              >
                Intervalo
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Player Row ───────────────────────────────────────────────────────────────

function PlayerRow({ player, tournament, actionLoading, onRebuy, onAddon, onEliminate, onPrize }: {
  player: TournamentPlayer
  tournament: Tournament
  actionLoading: string | null
  onRebuy: () => void
  onAddon: () => void
  onEliminate: () => void
  onPrize: () => void
}) {
  const isActive = ['REGISTERED', 'ACTIVE', 'WINNER'].includes(player.status)
  const canRebuy = isActive && !!tournament.rebuyAmount &&
    (tournament.rebuyUntilLevel === null || tournament.currentLevel <= tournament.rebuyUntilLevel)
  const canAddon = isActive && !!tournament.addonAmount && !player.hasAddon &&
    (tournament.addonAfterLevel === null || tournament.currentLevel >= tournament.addonAfterLevel)
  const canEliminate = isActive && player.status !== 'WINNER'
  const canPrize = isActive && tournament.status === 'RUNNING'

  return (
    <div className={`bg-[#39415C] rounded-xl p-3 ${player.status === 'WINNER' ? 'border border-yellow-600' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {player.status === 'WINNER' && <span className="text-yellow-400">🏆</span>}
            <span className="font-medium text-sm truncate">{player.player.name}</span>
          </div>
          <div className="flex flex-wrap gap-3 mt-1 text-xs text-[#B7D9BF]/50">
            {player.rebuysCount > 0 && <span>{player.rebuysCount}× rebuy</span>}
            {player.hasAddon && <span>add-on ✓</span>}
            {Number(player.bountyCollected) > 0 && (
              <span className="text-green-400">bounty {fmt(player.bountyCollected)}</span>
            )}
            {player.prizeAmount && (
              <span className="text-green-400">prêmio {fmt(player.prizeAmount)}</span>
            )}
            {player.status === 'ELIMINATED' && player.eliminatedAtLevel && (
              <span className="text-red-400">elim. nível {player.eliminatedAtLevel}</span>
            )}
          </div>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {canRebuy && (
            <button
              onClick={onRebuy}
              disabled={!!actionLoading}
              className="px-2 py-1 bg-[#4f5878] hover:bg-blue-700 rounded text-xs disabled:opacity-50"
            >
              Rebuy
            </button>
          )}
          {canAddon && (
            <button
              onClick={onAddon}
              disabled={!!actionLoading}
              className="px-2 py-1 bg-[#4f5878] hover:bg-purple-700 rounded text-xs disabled:opacity-50"
            >
              Add-on
            </button>
          )}
          {canEliminate && (
            <button
              onClick={onEliminate}
              disabled={!!actionLoading}
              className="px-2 py-1 bg-[#4f5878] hover:bg-red-700 rounded text-xs disabled:opacity-50"
            >
              Eliminar
            </button>
          )}
          {canPrize && player.status === 'WINNER' && (
            <button
              onClick={onPrize}
              disabled={!!actionLoading}
              className="px-2 py-1 bg-[#4f5878] hover:bg-green-700 rounded text-xs disabled:opacity-50"
            >
              Prêmio
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Payout Modal ─────────────────────────────────────────────────────────────

function PayoutModal({ payout, players, actionLoading, onClose, onPay }: {
  payout: PayoutSuggestion
  players: TournamentPlayer[]
  actionLoading: string | null
  onClose: () => void
  onPay: (playerId: string, amount: number) => Promise<void>
}) {
  // Monta mapa de quem já recebeu prêmio
  const paid = new Set(players.filter((p) => p.prizeAmount).map((p) => p.id))
  // Todos os jogadores que ainda não receberam (elegíveis = não eliminados)
  const eligible = players.filter((p) => p.status !== 'ELIMINATED' && !paid.has(p.id))
  // Selectors: para cada posição do suggestion, qual jogador recebe
  const [assignments, setAssignments] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {}
    payout.suggestion.forEach((s, i) => {
      const p = eligible[i]
      if (p) init[s.position] = p.id
    })
    return init
  })
  const [success, setSuccess] = useState<string | null>(null)

  const handlePay = async (position: number, amount: number) => {
    const playerId = assignments[position]
    if (!playerId) return
    await onPay(playerId, amount)
    setSuccess(`Prêmio de ${fmt(amount)} pago!`)
    setTimeout(() => setSuccess(null), 3000)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4">
      <div className="bg-[#39415C] rounded-2xl w-full max-w-md p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Distribuição de Prêmios</h3>
          <button onClick={onClose} className="text-[#B7D9BF]/50">✕</button>
        </div>

        <div className="text-center">
          <div className="text-xs text-[#B7D9BF]/50">Prize Pool Total</div>
          <div className="text-2xl font-bold text-green-400">{fmt(payout.prizePool)}</div>
        </div>

        {success && (
          <div className="bg-green-900/40 border border-green-700 rounded-lg px-3 py-2 text-sm text-green-300 text-center">
            {success}
          </div>
        )}

        <div className="space-y-3">
          {payout.suggestion.map((s) => {
            const medal = s.position === 1 ? '🥇' : s.position === 2 ? '🥈' : s.position === 3 ? '🥉' : `#${s.position}`
            const isLoading = actionLoading === `prize-${assignments[s.position]}`
            return (
              <div key={s.position} className="bg-[#434c6b] rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-base">{medal} {s.percent}%</span>
                  <span className="font-bold text-green-400">{fmt(s.amount)}</span>
                </div>
                <select
                  className="w-full bg-[#4f5878] border border-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#B7D9BF]"
                  value={assignments[s.position] ?? ''}
                  onChange={(e) => setAssignments((a) => ({ ...a, [s.position]: e.target.value }))}
                >
                  <option value="">Selecionar jogador</option>
                  {eligible.map((p) => (
                    <option key={p.id} value={p.id}>{p.player.name}</option>
                  ))}
                  {/* Também mostra quem já recebeu, para reatribuição */}
                  {players.filter((p) => paid.has(p.id)).map((p) => (
                    <option key={p.id} value={p.id}>{p.player.name} ✓</option>
                  ))}
                </select>
                <button
                  disabled={!assignments[s.position] || !!isLoading}
                  onClick={() => handlePay(s.position, s.amount)}
                  className="w-full py-2 bg-green-700 hover:bg-green-600 rounded-lg text-sm font-semibold disabled:opacity-50"
                >
                  {isLoading ? 'Pagando...' : `Pagar ${fmt(s.amount)}`}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
