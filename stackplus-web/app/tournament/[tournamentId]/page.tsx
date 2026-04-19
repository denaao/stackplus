'use client'

import React, { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import api from '@/services/api'
import AppLoading from '@/components/AppLoading'

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
  doubleBuyInBonusChips: number | null
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
  isPaused: boolean
  pausedAt: string | null
  dealPayouts: string | null
  payoutStructure: string | null
  prizePool: string
  totalRake: string
  totalTax: string
  doubleRebuyEnabled: boolean
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

// Calcula o prêmio esperado para uma posição com base na estrutura configurada
// Prioridade: dealPayouts → payoutStructure → null
function getExpectedPrize(position: number | null, tournament: Tournament): number | null {
  if (position == null) return null
  const prizePool = Number(tournament.prizePool)

  if (tournament.dealPayouts) {
    try {
      const payouts: { position: number; amount: number }[] = JSON.parse(tournament.dealPayouts)
      const entry = payouts.find((p) => p.position === position)
      if (entry) return entry.amount
    } catch {}
  }

  if (tournament.payoutStructure) {
    try {
      const structure: { position: number; percent: number }[] = JSON.parse(tournament.payoutStructure)
      const entry = structure.find((p) => p.position === position)
      if (entry) return Math.round(prizePool * entry.percent / 100 * 100) / 100
    } catch {}
  }

  return null
}

function elapsedSecondsFrom(startStr: string | null, referenceMs?: number): number {
  if (!startStr) return 0
  const val = Math.floor(((referenceMs ?? Date.now()) - new Date(startStr).getTime()) / 1000)
  return val < 0 ? 0 : val
}

// isPaused + pausedAt vêm do servidor — quando pausado, elapsed fica congelado
function useTimer(
  levelStartedAt: string | null,
  minutesPerLevel: number,
  isOnBreak: boolean,
  breakStartedAt: string | null,
  breakDurationMinutes: number | null,
  isPaused: boolean,
  pausedAt: string | null,
) {
  const startStr = isOnBreak ? breakStartedAt : levelStartedAt

  // Quando pausado, elapsed = momento da pausa − início (congelado)
  const frozenElapsed = isPaused && pausedAt ? elapsedSecondsFrom(startStr, new Date(pausedAt).getTime()) : null

  const [elapsed, setElapsed] = useState<number>(() =>
    frozenElapsed !== null ? frozenElapsed : elapsedSecondsFrom(startStr)
  )

  useEffect(() => {
    // Pausado: congela o elapsed no valor do momento da pausa
    if (isPaused && pausedAt) {
      setElapsed(elapsedSecondsFrom(startStr, new Date(pausedAt).getTime()))
      return
    }
    if (!startStr) return
    const start = new Date(startStr).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [levelStartedAt, breakStartedAt, isOnBreak, isPaused, pausedAt])

  const safeMins = (isOnBreak ? (breakDurationMinutes || 15) : (minutesPerLevel || 15))
  const totalSeconds = safeMins * 60
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
  const [registerBuyInType, setRegisterBuyInType] = useState<'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE' | null>(null)
  const [registerSelectedPlayer, setRegisterSelectedPlayer] = useState<{id: string, name: string} | null>(null)
  const [editingBlinds, setEditingBlinds] = useState(false)
  const [editLevels, setEditLevels] = useState<{ level: number; smallBlind: number; bigBlind: number; ante: number }[]>([])
  const [editBreaks, setEditBreaks] = useState<{ id: string; afterLevel: string; durationMinutes: string }[]>([])
  const [registeringPlayerId, setRegisteringPlayerId] = useState<string | null>(null)
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [playerSearch, setPlayerSearch] = useState('')
  const [homeGameMembers, setHomeGameMembers] = useState<any[]>([])
  const [selectedTab, setSelectedTab] = useState<'playing' | 'eliminated'>('playing')
  const [eliminateModal, setEliminateModal] = useState<TournamentPlayer | null>(null)
  const [eliminatorId, setEliminatorId] = useState('')
  const [rebuyModal, setRebuyModal] = useState<TournamentPlayer | null>(null)
  const [addonModal, setAddonModal] = useState<TournamentPlayer | null>(null)
  const [reEntrySelectedPlayer, setReEntrySelectedPlayer] = useState<TournamentPlayer | null>(null)
  const [reEntryType, setReEntryType] = useState<'NORMAL' | 'DOUBLE'>('NORMAL')
  const [reEntryWithAddon, setReEntryWithAddon] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/tournaments/${tournamentId}`)
      setTournament(res.data)
      // Carrega membros do home game na primeira carga.
      // Inclui o HOST como opção também — o dono pode jogar o próprio torneio.
      if (res.data.homeGameId && homeGameMembers.length === 0) {
        api.get(`/home-games/${res.data.homeGameId}`)
          .then((r) => {
            const members = Array.isArray(r.data.members) ? r.data.members : []
            const hostUser = r.data.host
            // Se o host não aparece em members (que é o caso padrão), injeta ele no topo.
            const hostAsMember = hostUser && !members.some((m: any) => m?.user?.id === hostUser.id)
              ? [{ id: `host-${hostUser.id}`, userId: hostUser.id, user: hostUser, paymentMode: null, role: 'HOST' }]
              : []
            setHomeGameMembers([...hostAsMember, ...members])
          })
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
      setError(typeof err === 'string' ? err : (err?.message || 'Erro'))
    } finally {
      setActionLoading(null)
    }
  }

  const loadPayout = async () => {
    const res = await api.get(`/tournaments/${tournamentId}/payout-suggestion`)
    setPayout(res.data)
    setShowPayout(true)
  }

  const registerPlayer = async () => {
    if (!registerSelectedPlayer) return
    setRegisteringPlayerId(registerSelectedPlayer.id)
    await action(async () => {
      const name = registerSelectedPlayer.name
      await api.post(`/tournaments/${tournamentId}/players`, {
        playerId: registerSelectedPlayer.id,
        homeGameId: tournament!.homeGameId,
        buyInType: registerBuyInType ?? 'NORMAL',
      })
      setRegisterSelectedPlayer(null); setRegisterBuyInType(null); setPlayerSearch('')
      setRegisterSuccess(`${name} inscrito`)
      setTimeout(() => setRegisterSuccess(null), 3000)
    }, 'register')
    setRegisteringPlayerId(null)
  }

  // Helpers para chips preview no modal de inscrição
  function calcRegisterChips(type: 'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE' | null) {
    if (!tournament) return 0
    const base = tournament.startingChips
    const taxChips = (tournament as any).buyInTaxChips ?? 0
    const bonus = tournament.doubleBuyInBonusChips ?? 0
    if (type === 'DOUBLE') return (base + taxChips) * 2 + bonus
    if (type === 'NORMAL_WITH_TAX') return base + taxChips
    return base
  }
  function calcRegisterAmount(type: 'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE' | null) {
    if (!tournament) return 0
    const base = Number(tournament.buyInAmount)
    const tax = (tournament as any).buyInTaxAmount ?? 0
    if (type === 'DOUBLE') return base * 2 + Number(tax)
    if (type === 'NORMAL_WITH_TAX') return base + Number(tax)
    return base
  }

  const submitReEntry = async () => {
    if (!reEntrySelectedPlayer) return
    await action(async () => {
      const name = reEntrySelectedPlayer.player.name
      await api.post(`/tournaments/players/${reEntrySelectedPlayer.id}/re-entry`, {
        reEntryType,
        withAddon: reEntryWithAddon,
      })
      setReEntrySelectedPlayer(null)
      setReEntryType('NORMAL')
      setReEntryWithAddon(false)
      setPlayerSearch('')
      setRegisterSuccess(`Re-entrada: ${name}`)
      setTimeout(() => setRegisterSuccess(null), 3000)
    }, 'reentry')
  }

  function closeRegisterModal() {
    setShowRegister(false)
    setPlayerSearch('')
    setRegisterSelectedPlayer(null)
    setRegisterBuyInType(null)
    setReEntrySelectedPlayer(null)
    setReEntryType('NORMAL')
    setReEntryWithAddon(false)
  }

  // Membros filtrados: remove quem já está inscrito no torneio
  const registeredPlayerIds = new Set(tournament?.players.map((p) => p.playerId) ?? [])
  const filteredMembers = homeGameMembers
    .filter((m: any) => !registeredPlayerIds.has(m.user?.id ?? m.userId))
    .filter((m: any) => {
      const name: string = m.user?.name ?? ''
      return name.toLowerCase().includes(playerSearch.toLowerCase())
    })

  if (loading) return <AppLoading />

  if (!tournament) return (
    <div className="min-h-screen bg-sx-bg flex items-center justify-center">
      <div className="text-red-400">{error}</div>
    </div>
  )

  const parsedBreaksMain: { afterLevel: number; durationMinutes: number }[] = (() => {
    try { return JSON.parse(tournament.breaks ?? '[]') } catch { return [] }
  })()
  const currentBreak = parsedBreaksMain.find((b) => b.afterLevel === tournament.currentLevel)
  const minutesPerLevel = tournament.isOnBreak
    ? (currentBreak?.durationMinutes ?? 15)
    : (tournament.minutesPerLevelPostLateReg ?? tournament.minutesPerLevelPreLateReg)

  const currentBlind = tournament.blindLevels.find((b) => b.level === tournament.currentLevel)

  const activePlayers = tournament.players
    .filter((p) => ['REGISTERED', 'ACTIVE', 'WINNER'].includes(p.status))
    .sort((a, b) => a.player.name.localeCompare(b.player.name, 'pt-BR', { sensitivity: 'base' }))
  const eliminatedPlayers = tournament.players.filter((p) => p.status === 'ELIMINATED')
    .sort((a, b) => (b.eliminatedAtLevel ?? 0) - (a.eliminatedAtLevel ?? 0))

  const filtered = (list: TournamentPlayer[]) =>
    list.filter((p) => p.player.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const statusBadge: Record<string, string> = {
    REGISTRATION: 'bg-blue-900/40 text-blue-300 border border-blue-700',
    RUNNING: 'bg-sx-cyan-deep/40 text-sx-cyan border border-sx-cyan-dim',
    ON_BREAK: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700',
    FINISHED: 'bg-sx-input text-sx-muted border border-sx-border2',
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
    <div className="min-h-screen bg-sx-bg text-white pb-8">

      {/* Header */}
      <div className="bg-sx-card border-b border-sx-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={() => router.push(`/homegame/${tournament.homeGameId}/tournaments`)} className="text-sx-muted hover:text-white">←</button>
          <div className="flex-1">
            <h1 className="font-bold text-lg">{tournament.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge[tournament.status]}`}>
                {statusLabel[tournament.status]}
              </span>
              <span className="text-xs text-white/40">{tournament.players.length} inscritos</span>
            </div>
          </div>
          <a
            href={`/tournament/${tournamentId}/clock`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-sx-muted hover:text-white px-3 py-1.5 bg-sx-input hover:bg-sx-card2 rounded-lg border border-sx-border2 whitespace-nowrap"
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
            onPrevious={() => action(() => api.post(`/tournaments/${tournamentId}/previous-level`), 'previous')}
            onBreak={() => action(() => api.post(`/tournaments/${tournamentId}/start-break`), 'break')}
            onEndBreak={() => action(() => api.post(`/tournaments/${tournamentId}/end-break`), 'endbreak')}
            onPause={() => action(() => api.post(`/tournaments/${tournamentId}/pause`), 'pause')}
            onResume={() => action(() => api.post(`/tournaments/${tournamentId}/resume`), 'resume')}
            actionLoading={actionLoading}
            editingBlinds={editingBlinds}
            setEditingBlinds={setEditingBlinds}
            editLevels={editLevels}
            setEditLevels={setEditLevels}
            editBreaks={editBreaks}
            setEditBreaks={setEditBreaks}
            onSaveBlinds={async () => {
              const validBreaks = editBreaks.filter((b) => b.afterLevel).map((b) => ({ afterLevel: parseInt(b.afterLevel), durationMinutes: parseInt(b.durationMinutes) || 15 }))
              await action(() => api.patch(`/tournaments/${tournamentId}/blind-levels`, { levels: editLevels, breaks: validBreaks }), 'blinds')
              setEditingBlinds(false)
            }}
            onUpdateLimits={(rebuyUntilLevel, addonAfterLevel) =>
              action(() => api.patch(`/tournaments/${tournamentId}/limits`, { rebuyUntilLevel, addonAfterLevel }), 'limits')
            }
          />
        )}

        {/* Prize pool */}
        <div className="bg-sx-card rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-white/40 mb-1">Prize Pool</div>
            <div className="text-2xl font-bold text-green-400">{fmt(tournament.prizePool)}</div>
            {Number(tournament.totalRake) > 0 && (
              <div className="text-xs text-white/40 mt-0.5">Rake: {fmt(tournament.totalRake)}</div>
            )}
          </div>
          {['RUNNING', 'ON_BREAK'].includes(tournament.status) && (
            <button
              onClick={() => action(loadPayout, 'payout')}
              className="text-sm text-yellow-400 hover:text-white border border-yellow-600/30 rounded-lg px-3 py-2"
            >
              $ Payout · 🤝 Acordo
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="flex gap-2 flex-wrap items-center">
          {(() => {
            const lateRegOpen = tournament.status === 'REGISTRATION' ||
              (tournament.status === 'RUNNING' &&
                (tournament.lateRegistrationLevel === null || tournament.currentLevel <= tournament.lateRegistrationLevel))
            const reEntryOpen = !!tournament.rebuyAmount &&
              (tournament.rebuyUntilLevel === null || tournament.currentLevel <= tournament.rebuyUntilLevel) &&
              eliminatedPlayers.length > 0
            if (!['REGISTRATION', 'RUNNING'].includes(tournament.status)) return null
            if (!lateRegOpen && !reEntryOpen) return null
            return (
              <button
                onClick={() => setShowRegister(true)}
                className="px-4 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-medium"
              >
                + Inscrever Jogador
              </button>
            )
          })()}
          {tournament.status === 'REGISTRATION' && (
            <button
              onClick={() => action(() => api.post(`/tournaments/${tournamentId}/start`), 'start')}
              disabled={!!actionLoading || tournament.players.length < 2}
              className="px-4 py-2 bg-sx-cyan-dim hover:bg-sx-cyan rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Iniciar Torneio
            </button>
          )}
          {/* Encerrar Jogo — aparece quando todos os jogadores ativos têm prêmio definido (acordo confirmado) */}
          {['RUNNING', 'ON_BREAK'].includes(tournament.status) &&
            activePlayers.length >= 2 &&
            activePlayers.every((p) => !!p.prizeAmount) && (
            <button
              onClick={() => {
                if (confirm('Encerrar o torneio? Os jogadores ativos serão marcados com as posições finais.'))
                  action(() => api.post(`/tournaments/${tournamentId}/finish-by-deal`), 'finish-deal')
              }}
              disabled={!!actionLoading}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              🏁 Encerrar Jogo
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={() => router.push(`/homegame/${tournament.homeGameId}/comandas`)}
            className="px-4 py-2 bg-sx-card2 hover:bg-sx-input rounded-lg text-sm font-medium border border-sx-border2 text-sx-muted hover:text-white"
          >
            🗂️ Comandas
          </button>
        </div>

        {/* Search */}
        <input
          className="w-full bg-sx-input border border-sx-border2 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sx-cyan"
          placeholder="Buscar jogador..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {/* Tabs */}
        <div className="flex border-b border-sx-border">
          <button
            onClick={() => setSelectedTab('playing')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${selectedTab === 'playing' ? 'border-sx-cyan text-white' : 'border-transparent text-white/40 hover:text-sx-cyan'}`}
          >
            Jogando ({activePlayers.length})
          </button>
          <button
            onClick={() => setSelectedTab('eliminated')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${selectedTab === 'eliminated' ? 'border-sx-cyan text-white' : 'border-transparent text-white/40 hover:text-sx-cyan'}`}
          >
            Eliminados ({eliminatedPlayers.length})
          </button>
        </div>

        {/* Player list */}
        <div className="rounded-xl overflow-hidden border border-white/5">
          {filtered(selectedTab === 'playing' ? activePlayers : eliminatedPlayers).map((p, i) => (
            <PlayerRow
              key={p.id}
              player={p}
              rowIndex={i}
              tournament={tournament}
              actionLoading={actionLoading}
              onRebuy={() => setRebuyModal(p)}
              onAddon={() => setAddonModal(p)}
              onEliminate={() => { setEliminateModal(p); setEliminatorId('') }}
              onPrize={() => {
                const amount = prompt(`Prêmio para ${p.player.name} (R$):`)
                if (amount) action(() => api.post(`/tournaments/players/${p.id}/prize`, { prizeAmount: parseFloat(amount) }), `prize-${p.id}`)
              }}
              onCancelRegistration={() => {
                if (confirm(`Cancelar inscrição de ${p.player.name}? O buy-in será estornado.`))
                  action(() => api.delete(`/tournaments/players/${p.id}`), `cancel-${p.id}`)
              }}
            />
          ))}
          {filtered(selectedTab === 'playing' ? activePlayers : eliminatedPlayers).length === 0 && (
            <div className="text-center text-white/30 py-8 text-sm">
              {selectedTab === 'playing' ? 'Nenhum jogador inscrito' : 'Nenhum eliminado ainda'}
            </div>
          )}
        </div>

      </div>

      {/* Register modal */}
      {showRegister && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded-2xl p-5 space-y-4" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(0,200,224,0.18)' }}>

            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(registerSelectedPlayer || reEntrySelectedPlayer) && (
                  <button
                    onClick={() => {
                      setRegisterSelectedPlayer(null)
                      setRegisterBuyInType(null)
                      setReEntrySelectedPlayer(null)
                      setReEntryType('NORMAL')
                      setReEntryWithAddon(false)
                    }}
                    className="text-sx-muted hover:text-white text-lg leading-none"
                  >
                    ←
                  </button>
                )}
                <h3 className="font-semibold text-white">
                  {reEntrySelectedPlayer ? 'Re-entrada' : 'Inscrever Jogador'}
                </h3>
              </div>
              <button onClick={closeRegisterModal} className="text-white/40 hover:text-white">✕</button>
            </div>

            {!registerSelectedPlayer && !reEntrySelectedPlayer ? (
              /* ── Step 1: selecionar jogador ou re-entrada ── */
              <>
                {registerSuccess && (
                  <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium" style={{ background: 'rgba(0,200,130,0.12)', border: '1px solid rgba(0,200,130,0.25)', color: '#00E090' }}>
                    <span>✓</span>
                    <span>{registerSuccess}</span>
                  </div>
                )}
                <input
                  className="w-full bg-sx-input border border-sx-border2 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sx-cyan"
                  placeholder="Filtrar por nome..."
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  autoFocus
                />
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {/* Novos jogadores */}
                  {filteredMembers.length === 0 && eliminatedPlayers.filter(p => p.player.name.toLowerCase().includes(playerSearch.toLowerCase())).length === 0 ? (
                    <div className="text-center text-white/30 py-6 text-sm">
                      {homeGameMembers.length === 0 ? 'Carregando membros...' : 'Nenhum jogador disponível'}
                    </div>
                  ) : (
                    <>
                      {filteredMembers.map((m: any) => {
                        const u = m.user ?? m
                        return (
                          <button
                            key={u.id}
                            onClick={() => { setRegisterSelectedPlayer({ id: u.id, name: u.name }); setRegisterBuyInType('NORMAL') }}
                            className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-colors"
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                            onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(0,200,224,0.08)')}
                            onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                          >
                            <span className="font-medium text-white">{u.name}</span>
                            <span className="text-white/30 text-xs">{u.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</span>
                          </button>
                        )
                      })}
                      {/* Eliminados que podem re-entrar */}
                      {(() => {
                        const canReEntry = !!tournament.rebuyAmount &&
                          (tournament.rebuyUntilLevel === null || tournament.currentLevel <= tournament.rebuyUntilLevel)
                        if (!canReEntry) return null
                        const filteredElim = eliminatedPlayers.filter(p =>
                          p.player.name.toLowerCase().includes(playerSearch.toLowerCase())
                        )
                        if (filteredElim.length === 0) return null
                        return (
                          <>
                            <div className="text-xs text-white/35 uppercase tracking-widest pt-3 pb-1 px-1">↩ Re-entrada</div>
                            {filteredElim.map((p) => (
                              <button
                                key={p.id}
                                onClick={() => { setReEntrySelectedPlayer(p); setReEntryType('NORMAL'); setReEntryWithAddon(false) }}
                                className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-colors"
                                style={{ background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.15)' }}
                                onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(251,146,60,0.12)')}
                                onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(251,146,60,0.06)')}
                              >
                                <span className="font-medium text-white">{p.player.name}</span>
                                <span className="text-orange-400 text-xs font-medium">Re-entrada</span>
                              </button>
                            ))}
                          </>
                        )
                      })()}
                    </>
                  )}
                </div>
              </>
            ) : reEntrySelectedPlayer ? (
              /* ── Step 2: re-entrada ── */
              <>
                {/* Jogador selecionado */}
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.2)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-orange-400" style={{ background: 'rgba(251,146,60,0.12)' }}>
                    {reEntrySelectedPlayer.player.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="font-semibold text-white">{reEntrySelectedPlayer.player.name}</span>
                    <div className="text-xs text-white/40 mt-0.5">{reEntrySelectedPlayer.rebuysCount} rebuy{reEntrySelectedPlayer.rebuysCount !== 1 ? 's' : ''} anteriores</div>
                  </div>
                </div>

                {/* Tipo de re-entrada */}
                <div className="space-y-2">
                  <p className="text-xs text-sx-muted uppercase tracking-wider">Tipo de Re-entrada</p>
                  {[
                    { key: 'NORMAL' as const, label: 'Simples', chips: tournament.rebuyChips ?? tournament.startingChips, amount: Number(tournament.rebuyAmount) },
                    ...(tournament.doubleRebuyEnabled ? [{
                      key: 'DOUBLE' as const,
                      label: 'Dupla',
                      chips: (tournament.rebuyChips ?? tournament.startingChips) * 2,
                      amount: Number(tournament.rebuyAmount) * 2,
                    }] : []),
                  ].map((opt) => {
                    const isSelected = reEntryType === opt.key
                    const color = opt.key === 'DOUBLE'
                      ? 'linear-gradient(135deg, #FFB800 0%, #CC7000 100%)'
                      : 'linear-gradient(135deg, #00C8E0 0%, #007A95 100%)'
                    const glow = opt.key === 'DOUBLE'
                      ? '0 4px 16px rgba(255,184,0,0.3)'
                      : '0 4px 16px rgba(0,200,224,0.3)'
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setReEntryType(opt.key)}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left"
                        style={{
                          background: isSelected ? color : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${isSelected ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
                          boxShadow: isSelected ? glow : 'none',
                        }}
                      >
                        <div>
                          <p className="text-sm font-bold" style={{ color: isSelected ? '#050D15' : 'rgba(255,255,255,0.7)' }}>{opt.label}</p>
                          <p className="text-xs mt-0.5" style={{ color: isSelected ? 'rgba(5,13,21,0.6)' : 'rgba(255,255,255,0.35)' }}>
                            {opt.chips.toLocaleString('pt-BR')} fichas
                          </p>
                        </div>
                        <span className="text-base font-black" style={{ color: isSelected ? '#050D15' : 'white' }}>
                          {fmt(opt.amount)}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Addon (se disponível neste nível e jogador ainda não fez) */}
                {!!tournament.addonAmount && !reEntrySelectedPlayer.hasAddon &&
                  (tournament.addonAfterLevel === null || tournament.currentLevel >= (tournament.addonAfterLevel ?? 0)) && (
                  <button
                    type="button"
                    onClick={() => setReEntryWithAddon(!reEntryWithAddon)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left"
                    style={{
                      background: reEntryWithAddon ? 'linear-gradient(135deg, #00E0A0 0%, #00957A 100%)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${reEntryWithAddon ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
                      boxShadow: reEntryWithAddon ? '0 4px 16px rgba(0,224,160,0.3)' : 'none',
                    }}
                  >
                    <span className="text-lg">{reEntryWithAddon ? '☑' : '☐'}</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold" style={{ color: reEntryWithAddon ? '#050D15' : 'rgba(255,255,255,0.7)' }}>
                        Incluir Add-on
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: reEntryWithAddon ? 'rgba(5,13,21,0.6)' : 'rgba(255,255,255,0.35)' }}>
                        +{(tournament.addonChips ?? tournament.startingChips).toLocaleString('pt-BR')} fichas
                      </p>
                    </div>
                    <span className="text-base font-black" style={{ color: reEntryWithAddon ? '#050D15' : 'white' }}>
                      {fmt(Number(tournament.addonAmount))}
                    </span>
                  </button>
                )}

                {/* Preview total */}
                <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(251,146,60,0.15)' }}>
                  <p className="text-xs text-sx-muted mb-1">
                    Total · {fmt(
                      Number(tournament.rebuyAmount) * (reEntryType === 'DOUBLE' ? 2 : 1) +
                      (reEntryWithAddon ? Number(tournament.addonAmount ?? 0) : 0)
                    )}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-white">
                      {(
                        (tournament.rebuyChips ?? tournament.startingChips) * (reEntryType === 'DOUBLE' ? 2 : 1) +
                        (reEntryWithAddon ? (tournament.addonChips ?? tournament.startingChips) : 0)
                      ).toLocaleString('pt-BR')}
                    </span>
                    <span className="text-sx-muted text-sm">fichas</span>
                  </div>
                </div>

                {/* Erro */}
                {error && (
                  <div className="rounded-xl px-3 py-2 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    {error}
                  </div>
                )}

                {/* Confirmar */}
                <button
                  onClick={submitReEntry}
                  disabled={!!actionLoading}
                  className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #FB923C 0%, #C2410C 100%)' }}
                >
                  {actionLoading === 'reentry' ? 'Processando...' : 'Confirmar Re-entrada'}
                </button>
              </>
            ) : (
              /* ── Step 2: escolher tipo de buy-in ── */
              <>
                {/* Jogador selecionado */}
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: 'rgba(0,200,224,0.08)', border: '1px solid rgba(0,200,224,0.15)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-sx-cyan" style={{ background: 'rgba(0,200,224,0.12)' }}>
                    {registerSelectedPlayer!.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-semibold text-white">{registerSelectedPlayer!.name}</span>
                </div>

                {/* Seleção de tipo de buy-in */}
                <BuyInSelector
                  baseAmount={Number(tournament.buyInAmount)}
                  taxAmount={Number((tournament as any).buyInTaxAmount ?? 0)}
                  taxChips={Number((tournament as any).buyInTaxChips ?? 0)}
                  startingChips={tournament.startingChips}
                  doubleBonusChips={tournament.doubleBuyInBonusChips ?? 0}
                  selected={registerBuyInType ?? 'NORMAL'}
                  onChange={(t) => setRegisterBuyInType(t)}
                />

                {/* Preview de fichas */}
                <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,224,0.1)' }}>
                  <p className="text-xs text-sx-muted mb-1">Fichas a entregar · {fmt(calcRegisterAmount(registerBuyInType))}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-white">
                      {calcRegisterChips(registerBuyInType).toLocaleString('pt-BR')}
                    </span>
                    <span className="text-sx-muted text-sm">fichas</span>
                  </div>
                </div>

                {/* Erro de inscrição */}
                {error && (
                  <div className="rounded-xl px-3 py-2 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    {error}
                  </div>
                )}

                {/* Confirmar */}
                <button
                  onClick={registerPlayer}
                  disabled={!!actionLoading}
                  className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 btn-sx-primary"
                >
                  {actionLoading === 'register' ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Inscrevendo...
                    </span>
                  ) : 'Confirmar Inscrição'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Rebuy modal */}
      {rebuyModal && (() => {
        const baseAmount = Number(tournament.rebuyAmount)
        const taxAmount = Number((tournament as any).rebuyTaxAmount ?? 0)
        const baseChips = tournament.rebuyChips ?? tournament.startingChips
        const taxChips = Number((tournament as any).rebuyTaxChips ?? 0)
        return (
          <ActionModal
            title={`Rebuy — ${rebuyModal.player.name}`}
            baseLabel="Simples"
            baseAmount={baseAmount}
            taxAmount={taxAmount}
            baseChips={baseChips}
            taxChips={taxChips}
            hasDouble={tournament.doubleRebuyEnabled}
            actionLoading={actionLoading}
            onClose={() => setRebuyModal(null)}
            onConfirm={(type) => {
              action(() => api.post(`/tournaments/players/${rebuyModal.id}/rebuy`, { rebuyType: type }), `rebuy-${rebuyModal.id}`)
              setRebuyModal(null)
            }}
          />
        )
      })()}

      {/* Addon modal */}
      {addonModal && (() => {
        const baseAmount = Number(tournament.addonAmount)
        const taxAmount = Number((tournament as any).addonTaxAmount ?? 0)
        const baseChips = tournament.addonChips ?? tournament.startingChips
        const taxChips = Number((tournament as any).addonTaxChips ?? 0)
        return (
          <ActionModal
            title={`Add-on — ${addonModal.player.name}`}
            baseLabel="Simples"
            baseAmount={baseAmount}
            taxAmount={taxAmount}
            baseChips={baseChips}
            taxChips={taxChips}
            actionLoading={actionLoading}
            onClose={() => setAddonModal(null)}
            onConfirm={(type) => {
              action(() => api.post(`/tournaments/players/${addonModal.id}/addon`, { withTax: type !== 'NORMAL' }), `addon-${addonModal.id}`)
              setAddonModal(null)
            }}
          />
        )
      })()}

      {/* Eliminate modal */}
      {eliminateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4">
          <div className="bg-sx-card rounded-2xl w-full max-w-md p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Eliminar {eliminateModal.player.name}</h3>
              <button onClick={() => setEliminateModal(null)} className="text-white/40">✕</button>
            </div>
            {tournament.bountyAmount && (
              <div>
                <label className="block text-xs text-sx-muted mb-1">Quem eliminou? (bounty)</label>
                <select
                  className="w-full bg-sx-input border border-sx-border2 rounded-lg px-3 py-2 text-sm focus:outline-none"
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
          tournamentId={tournamentId}
          actionLoading={actionLoading}
          onClose={() => { setShowPayout(false); load() }}
          onPay={async (playerId, amount) => {
            await action(async () => {
              await api.post(`/tournaments/players/${playerId}/prize`, { prizeAmount: amount })
            }, `prize-${playerId}`)
          }}
          onFinishByDeal={async () => {
            await action(() => api.post(`/tournaments/${tournamentId}/finish-by-deal`), 'finish-deal')
          }}
          onSetDealPayouts={async (payouts) => {
            await action(() => api.post(`/tournaments/${tournamentId}/set-deal-payouts`, { payouts }), 'set-deal-payouts')
          }}
          onSetPayoutStructure={async (structure) => {
            await action(() => api.post(`/tournaments/${tournamentId}/set-payout-structure`, { structure }), 'set-payout-structure')
          }}
        />
      )}
    </div>
  )
}

// ─── Timer Card ───────────────────────────────────────────────────────────────

function TimerCard({ tournament, currentBlind, onAdvance, onPrevious, onBreak, onEndBreak, onPause, onResume, actionLoading, editingBlinds, setEditingBlinds, editLevels, setEditLevels, editBreaks, setEditBreaks, onSaveBlinds, onUpdateLimits }: {
  tournament: Tournament
  currentBlind: BlindLevel | undefined
  onAdvance: () => void
  onPrevious: () => void
  onBreak: () => void
  onEndBreak: () => void
  onPause: () => void
  onResume: () => void
  actionLoading: string | null
  editingBlinds: boolean
  setEditingBlinds: (v: boolean) => void
  editLevels: { level: number; smallBlind: number; bigBlind: number; ante: number }[]
  setEditLevels: React.Dispatch<React.SetStateAction<{ level: number; smallBlind: number; bigBlind: number; ante: number }[]>>
  editBreaks: { id: string; afterLevel: string; durationMinutes: string }[]
  setEditBreaks: React.Dispatch<React.SetStateAction<{ id: string; afterLevel: string; durationMinutes: string }[]>>
  onSaveBlinds: () => Promise<void>
  onUpdateLimits: (rebuyUntilLevel: number | null, addonAfterLevel: number | null) => void
}) {
  const parsedBreaksTimer: { afterLevel: number; durationMinutes: number }[] = (() => {
    try { return JSON.parse(tournament.breaks ?? '[]') } catch { return [] }
  })()

  const nextBreak = parsedBreaksTimer.find((b) => b.afterLevel === tournament.currentLevel)
  const activeBreak = parsedBreaksTimer.find((b) => b.afterLevel === tournament.currentLevel)
  const breakDuration = activeBreak?.durationMinutes || 15

  const minutesPerLevel = tournament.isOnBreak
    ? breakDuration
    : (tournament.minutesPerLevelPostLateReg || tournament.minutesPerLevelPreLateReg || 15)

  const { display, overTime } = useTimer(
    tournament.levelStartedAt,
    minutesPerLevel,
    tournament.isOnBreak,
    tournament.breakStartedAt,
    breakDuration,
    tournament.isPaused,
    tournament.pausedAt,
  )

  const isPaused = tournament.isPaused
  const isBreak = tournament.isOnBreak

  // Próxima blind
  const sortedLevels = [...tournament.blindLevels].sort((a, b) => a.level - b.level)
  const nextBlind = sortedLevels.find((l) => l.level === tournament.currentLevel + 1)

  // Auto-avança para o próximo nível quando o tempo esgota
  // Se há intervalo configurado após o nível atual, entra em break em vez de avançar
  const autoAdvancedRef = useRef(false)
  const autoBreakEndedRef = useRef(false)
  useEffect(() => { autoAdvancedRef.current = false }, [tournament.levelStartedAt])
  useEffect(() => { autoBreakEndedRef.current = false }, [tournament.breakStartedAt])
  useEffect(() => {
    if (overTime && !isBreak && !isPaused && !actionLoading && !autoAdvancedRef.current) {
      autoAdvancedRef.current = true
      if (nextBreak) {
        onBreak()
      } else {
        onAdvance()
      }
    }
  }, [overTime, isBreak, isPaused, actionLoading])
  // Auto-encerra intervalo quando o tempo do break esgota
  useEffect(() => {
    if (overTime && isBreak && !isPaused && !actionLoading && !autoBreakEndedRef.current) {
      autoBreakEndedRef.current = true
      onEndBreak()
    }
  }, [overTime, isBreak, isPaused, actionLoading])

  const accent = isBreak ? 'border-yellow-700 bg-yellow-900/20' : 'border-white/8 bg-sx-card'
  const timerColor = overTime ? '#f87171'
    : isBreak ? (isPaused ? '#854d0e' : '#eab308')
    : (isPaused ? 'rgba(255,255,255,0.25)' : '#ffffff')

  return (
    <div className={`rounded-xl border ${accent} overflow-hidden`}>

      {/* Corpo principal: blinds + timer */}
      <div className="flex items-start gap-4">

        {/* Blinds atuais */}
        <div className="flex-1 min-w-0 px-4 pt-4 pb-3">
          {isBreak ? (
            <>
              <div className="text-xs font-semibold tracking-widest uppercase text-yellow-600 mb-1">Intervalo</div>
              <div className="text-2xl font-bold text-yellow-400">{breakDuration} minutos</div>
              {isPaused && <div className="text-xs text-white/30 mt-1">pausado</div>}
            </>
          ) : (
            <>
              <div className="text-xs font-semibold tracking-widest uppercase text-sx-muted mb-1">
                Nível {tournament.currentLevel}{isPaused && <span className="ml-2 text-white/25">· pausado</span>}
              </div>
              {currentBlind ? (
                <div className="text-2xl font-bold text-white leading-tight">
                  {currentBlind.smallBlind.toLocaleString()} / {currentBlind.bigBlind.toLocaleString()}
                  {currentBlind.ante > 0 && (
                    <span className="text-base font-normal text-white/50 ml-2">Ante {currentBlind.ante.toLocaleString()}</span>
                  )}
                </div>
              ) : (
                <div className="text-2xl font-bold text-white/30">—</div>
              )}
              {/* Próximo nível */}
              {nextBlind && !isBreak && (
                <div className="mt-2 text-xs text-white/35">
                  Próximo · {nextBlind.smallBlind.toLocaleString()} / {nextBlind.bigBlind.toLocaleString()}
                  {nextBlind.ante > 0 && ` · Ante ${nextBlind.ante.toLocaleString()}`}
                  {nextBreak && <span className="ml-2 text-yellow-600">· intervalo após</span>}
                </div>
              )}

            </>
          )}
        </div>

        {/* Timer grande */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 flex items-center">
          <div
            className="font-mono font-black tabular-nums leading-none"
            style={{ fontSize: 'clamp(2.8rem, 6vw, 3.8rem)', color: timerColor }}
          >
            {overTime && !isBreak ? '+' : ''}{display}
          </div>
        </div>
      </div>

      {/* Barra de controles */}
      <div className="flex gap-2 px-3 pb-3 border-t border-white/5 pt-3">

        {isBreak ? (
          /* Durante intervalo: pausar + encerrar intervalo */
          <>
            <button
              onClick={isPaused ? onResume : onPause}
              disabled={!!actionLoading}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-sx-input hover:bg-sx-card2 border border-sx-border2 text-white/60 disabled:opacity-50"
            >
              {isPaused ? '▶ Continuar' : '⏸ Pausar'}
            </button>
            <button
              onClick={onEndBreak}
              disabled={!!actionLoading}
              className="flex-1 py-2.5 bg-yellow-700 hover:bg-yellow-600 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              Encerrar Intervalo
            </button>
          </>
        ) : (
          /* Durante blind normal: voltar · pausar · próximo */
          <>
            <button
              onClick={onPrevious}
              disabled={!!actionLoading || tournament.currentLevel <= 1}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-sx-input hover:bg-sx-card2 border border-sx-border2 text-white/60 disabled:opacity-30"
            >
              ◀ Anterior
            </button>
            <button
              onClick={isPaused ? onResume : onPause}
              disabled={!!actionLoading}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-sx-input hover:bg-sx-card2 border border-sx-border2 text-white/60 disabled:opacity-50"
            >
              {isPaused ? '▶ Continuar' : '⏸ Pausar'}
            </button>
            <button
              onClick={nextBreak ? onBreak : onAdvance}
              disabled={!!actionLoading}
              className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {nextBreak ? 'Intervalo ▶' : 'Próximo ▶'}
            </button>
          </>
        )}
      </div>

      {/* Botão editar estrutura de blinds — abaixo dos controles */}
      {!editingBlinds && (
        <div className="px-3 pb-3 flex items-center gap-4 flex-wrap border-t border-white/5 pt-3">
          <button
            onClick={() => {
              const parsedBreaks: { afterLevel: number; durationMinutes: number }[] = (() => { try { return JSON.parse(tournament.breaks ?? '[]') } catch { return [] } })()
              setEditLevels(tournament.blindLevels.map((l) => ({ ...l })))
              setEditBreaks(parsedBreaks.map((b, i) => ({ id: String(i), afterLevel: String(b.afterLevel), durationMinutes: String(b.durationMinutes) })))
              setEditingBlinds(true)
            }}
            className="text-xs text-sx-cyan hover:text-white"
          >
            ✎ Editar blinds
          </button>
          {(!!tournament.rebuyAmount || !!tournament.addonAmount) && (
            <InlineLimitsEditor
              tournament={tournament}
              onSave={onUpdateLimits}
              actionLoading={actionLoading}
            />
          )}
        </div>
      )}

      {/* Editor full-width — aparece quando editingBlinds === true */}
      {editingBlinds && (
        <div className="border-t border-white/10 px-3 pb-4 pt-3 space-y-3">
          <div className="text-xs text-sx-muted uppercase tracking-widest font-medium mb-2">Editar estrutura de blinds</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '40px' }} />
              <col />
              <col />
              <col />
              <col style={{ width: '28px' }} />
            </colgroup>
            <thead>
              <tr style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', paddingBottom: '4px' }}>Nível</th>
                <th style={{ textAlign: 'center', paddingBottom: '4px' }}>SB</th>
                <th style={{ textAlign: 'center', paddingBottom: '4px' }}>BB</th>
                <th style={{ textAlign: 'center', paddingBottom: '4px' }}>Ante</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {editLevels.map((lv, idx) => (
                <tr key={lv.level} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '4px 4px 4px 0', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>{lv.level}</td>
                  {(['smallBlind', 'bigBlind', 'ante'] as const).map((field) => (
                    <td key={field} style={{ padding: '4px 4px' }}>
                      <input
                        type="number" min={0}
                        value={lv[field]}
                        onChange={(e) => setEditLevels((prev) => prev.map((x, i) => i === idx ? { ...x, [field]: parseInt(e.target.value) || 0 } : x))}
                        style={{ width: '100%', background: '#0A1F30', border: '1px solid #1A3550', borderRadius: '4px', padding: '4px 6px', fontSize: '12px', textAlign: 'center', color: 'white', outline: 'none' }}
                      />
                    </td>
                  ))}
                  <td style={{ padding: '4px 0 4px 4px', textAlign: 'center' }}>
                    <button
                      onClick={() => setEditLevels((prev) => prev.filter((_, i) => i !== idx).map((x, i) => ({ ...x, level: i + 1 })))}
                      style={{ color: '#ef4444', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer' }}
                      title="Remover nível"
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => setEditLevels((prev) => [...prev, { level: prev.length + 1, smallBlind: 0, bigBlind: 0, ante: 0 }])}
            className="text-xs text-sx-cyan hover:text-white"
          >+ Adicionar nível</button>

          {/* Intervalos */}
          <div className="border-t border-white/8 pt-3 space-y-2">
            <div className="text-xs text-white/40 uppercase tracking-widest">Intervalos</div>
            {editBreaks.map((b) => (
              <div key={b.id} className="flex items-center gap-2">
                <span className="text-xs text-white/40 w-28 shrink-0">Após nível</span>
                <input
                  type="number" min={1}
                  value={b.afterLevel}
                  onChange={(e) => setEditBreaks((prev) => prev.map((x) => x.id === b.id ? { ...x, afterLevel: e.target.value } : x))}
                  className="w-16 bg-sx-input border border-sx-border2 rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-sx-cyan"
                />
                <span className="text-xs text-white/40">dur. (min)</span>
                <input
                  type="number" min={1}
                  value={b.durationMinutes}
                  onChange={(e) => setEditBreaks((prev) => prev.map((x) => x.id === b.id ? { ...x, durationMinutes: e.target.value } : x))}
                  className="w-16 bg-sx-input border border-sx-border2 rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-sx-cyan"
                />
                <button
                  onClick={() => setEditBreaks((prev) => prev.filter((x) => x.id !== b.id))}
                  className="text-red-500 hover:text-red-300 text-xs"
                >✕</button>
              </div>
            ))}
            <button
              onClick={() => setEditBreaks((prev) => [...prev, { id: String(Date.now()), afterLevel: '', durationMinutes: '15' }])}
              className="text-xs text-sx-cyan hover:text-white"
            >+ Adicionar intervalo</button>
          </div>

          {/* Salvar / Cancelar */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onSaveBlinds}
              className="flex-1 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm font-semibold"
            >
              Salvar
            </button>
            <button
              onClick={() => setEditingBlinds(false)}
              className="px-4 py-2 bg-sx-input hover:bg-sx-card2 rounded-lg text-sm text-white/50 border border-sx-border2"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Player Row ───────────────────────────────────────────────────────────────

function PlayerRow({ player, tournament, rowIndex, actionLoading, onRebuy, onAddon, onEliminate, onPrize, onCancelRegistration }: {
  player: TournamentPlayer
  tournament: Tournament
  rowIndex: number
  actionLoading: string | null
  onRebuy: () => void
  onAddon: () => void
  onEliminate: () => void
  onPrize: () => void
  onCancelRegistration: () => void
}) {
  const isActive = ['REGISTERED', 'ACTIVE', 'WINNER'].includes(player.status)
  const canRebuy = isActive && tournament.status !== 'REGISTRATION' && !!tournament.rebuyAmount &&
    (tournament.rebuyUntilLevel === null || tournament.currentLevel <= tournament.rebuyUntilLevel)

  const parsedBreaksForAddon: { afterLevel: number; durationMinutes: number }[] = (() => {
    try { return JSON.parse(tournament.breaks ?? '[]') } catch { return [] }
  })()
  const addonLevel = tournament.addonAfterLevel
  const addonNextIsBreak = addonLevel != null && parsedBreaksForAddon.some((b) => b.afterLevel === addonLevel)
  const atAddonLevel = !tournament.isOnBreak && tournament.currentLevel === addonLevel && addonNextIsBreak
  const duringAddonBreak = tournament.isOnBreak && tournament.currentLevel === addonLevel
  const canAddon = isActive && !!tournament.addonAmount && !player.hasAddon &&
    (addonLevel === null || atAddonLevel || duringAddonBreak)
  const canEliminate = isActive && tournament.status !== 'REGISTRATION' && player.status !== 'WINNER'
  const canPrize = isActive && tournament.status === 'RUNNING'
  const canCancelRegistration = tournament.status === 'REGISTRATION' && player.status === 'REGISTERED'

  const rowBg = player.status === 'WINNER'
    ? 'bg-yellow-900/20 border-l-2 border-l-yellow-600'
    : rowIndex % 2 === 0 ? 'bg-sx-card' : 'bg-white/[0.03]'

  // Posição do eliminado: gravada no banco
  const posLabel = player.status === 'ELIMINATED' && player.position != null
    ? player.position === 1 ? '🥇 1º'
    : player.position === 2 ? '🥈 2º'
    : player.position === 3 ? '🥉 3º'
    : `${player.position}º`
    : null

  return (
    <div className={`${rowBg} p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {player.status === 'WINNER' && <span className="text-yellow-400">🏆</span>}
            {posLabel && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                {posLabel}
              </span>
            )}
            <span className="font-medium text-sm truncate">{player.player.name}</span>
          </div>
          <div className="flex flex-wrap gap-3 mt-1 text-xs text-white/40">
            {player.rebuysCount > 0 && <span>{player.rebuysCount}× rebuy</span>}
            {player.hasAddon && <span>add-on ✓</span>}
            {Number(player.bountyCollected) > 0 && (
              <span className="text-sx-cyan">bounty {fmt(player.bountyCollected)}</span>
            )}
            {player.status === 'ELIMINATED' && player.eliminatedAtLevel && (
              <span>elim. nível {player.eliminatedAtLevel}</span>
            )}
          </div>
          {['ELIMINATED', 'WINNER'].includes(player.status) && (() => {
            const expected = getExpectedPrize(player.position, tournament)
            if (!expected) return null
            return (
              <div className="mt-1 text-xs font-semibold">
                <span className="text-sx-cyan">Prêmio: {fmt(expected)}</span>
              </div>
            )
          })()}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {canRebuy && (
            <button
              onClick={onRebuy}
              disabled={!!actionLoading}
              className="px-2 py-1 bg-sx-card2 hover:bg-blue-700 rounded text-xs disabled:opacity-50"
            >
              Rebuy
            </button>
          )}
          {canAddon && (
            <button
              onClick={onAddon}
              disabled={!!actionLoading}
              className="px-2 py-1 bg-sx-card2 hover:bg-purple-700 rounded text-xs disabled:opacity-50"
            >
              Add-on
            </button>
          )}
          {canEliminate && (
            <button
              onClick={onEliminate}
              disabled={!!actionLoading}
              className="px-2 py-1 bg-sx-card2 hover:bg-red-700 rounded text-xs disabled:opacity-50"
            >
              Eliminar
            </button>
          )}
          {canCancelRegistration && (
            <button
              onClick={onCancelRegistration}
              disabled={!!actionLoading}
              className="px-2 py-1 bg-sx-card2 hover:bg-red-900 rounded text-xs text-red-400 disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── InlineLimitsEditor ───────────────────────────────────────────────────────

function InlineLimitsEditor({ tournament, onSave, actionLoading }: {
  tournament: Tournament
  onSave: (rebuyUntilLevel: number | null, addonAfterLevel: number | null) => void
  actionLoading: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [rebuyUntil, setRebuyUntil] = useState(String(tournament.rebuyUntilLevel ?? ''))
  const [addonAfter, setAddonAfter] = useState(String(tournament.addonAfterLevel ?? ''))

  React.useEffect(() => {
    if (!editing) {
      setRebuyUntil(String(tournament.rebuyUntilLevel ?? ''))
      setAddonAfter(String(tournament.addonAfterLevel ?? ''))
    }
  }, [tournament.rebuyUntilLevel, tournament.addonAfterLevel, editing])

  const handleSave = async () => {
    await onSave(
      rebuyUntil ? parseInt(rebuyUntil) : null,
      addonAfter ? parseInt(addonAfter) : null,
    )
    setEditing(false)
  }

  const miniInput = { width: '40px', background: '#0A1F30', border: '1px solid #1A3550', borderRadius: '4px', padding: '2px 4px', fontSize: '12px', textAlign: 'center' as const, color: 'white', outline: 'none' }

  if (editing) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        {!!tournament.rebuyAmount && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-white/40">Rebuy até</span>
            <input type="number" min={1} style={miniInput} value={rebuyUntil} onChange={(e) => setRebuyUntil(e.target.value)} placeholder="∞" />
          </div>
        )}
        {!!tournament.addonAmount && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-white/40">Addon após</span>
            <input type="number" min={1} style={miniInput} value={addonAfter} onChange={(e) => setAddonAfter(e.target.value)} placeholder="—" />
          </div>
        )}
        <button onClick={handleSave} disabled={!!actionLoading} className="text-xs text-sx-cyan disabled:opacity-50">✓ ok</button>
        <button onClick={() => setEditing(false)} className="text-xs text-white/30 hover:text-white">✕</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {!!tournament.rebuyAmount && (
        <span className="text-xs text-white/40">
          Rebuy até <span className="text-white/70 font-medium">{tournament.rebuyUntilLevel ?? '∞'}</span>
        </span>
      )}
      {!!tournament.addonAmount && (
        <span className="text-xs text-white/40">
          Addon após <span className="text-white/70 font-medium">{tournament.addonAfterLevel ?? '—'}</span>
        </span>
      )}
      <button onClick={() => setEditing(true)} className="text-xs text-sx-cyan hover:text-white">✎</button>
    </div>
  )
}

// ─── BuyInSelector ────────────────────────────────────────────────────────────

function BuyInSelector({ baseAmount, taxAmount, taxChips, startingChips, doubleBonusChips, selected, onChange }: {
  baseAmount: number
  taxAmount: number
  taxChips: number
  startingChips: number
  doubleBonusChips: number
  selected: 'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE'
  onChange: (t: 'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE') => void
}) {
  const hasTax = taxAmount > 0 && taxChips > 0
  const hasDouble = doubleBonusChips > 0

  const options: { key: 'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE'; label: string; amount: number; chips: number; color: string; glow: string }[] = [
    { key: 'NORMAL', label: 'Simples', amount: baseAmount, chips: startingChips, color: 'linear-gradient(135deg, #00C8E0 0%, #007A95 100%)', glow: '0 4px 16px rgba(0,200,224,0.3)' },
    ...(hasTax ? [{ key: 'NORMAL_WITH_TAX' as const, label: 'Simples + Opcional', amount: baseAmount + taxAmount, chips: startingChips + taxChips, color: 'linear-gradient(135deg, #00E0A0 0%, #00957A 100%)', glow: '0 4px 16px rgba(0,224,160,0.3)' }] : []),
    ...(hasDouble ? [{ key: 'DOUBLE' as const, label: 'Duplo', amount: baseAmount * 2 + taxAmount * 2, chips: (startingChips + taxChips) * 2 + doubleBonusChips, color: 'linear-gradient(135deg, #FFB800 0%, #CC7000 100%)', glow: '0 4px 16px rgba(255,184,0,0.3)' }] : []),
  ]

  return (
    <div className="space-y-2">
      <p className="text-xs text-sx-muted uppercase tracking-wider">Tipo de Buy-in</p>
      {options.map((opt) => {
        const isSelected = selected === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left"
            style={{
              background: isSelected ? opt.color : 'rgba(255,255,255,0.04)',
              border: `1px solid ${isSelected ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
              boxShadow: isSelected ? opt.glow : 'none',
            }}
          >
            <div>
              <p className="text-sm font-bold" style={{ color: isSelected ? '#050D15' : 'rgba(255,255,255,0.7)' }}>{opt.label}</p>
              <p className="text-xs mt-0.5" style={{ color: isSelected ? 'rgba(5,13,21,0.6)' : 'rgba(255,255,255,0.35)' }}>
                {opt.chips.toLocaleString('pt-BR')} fichas
              </p>
            </div>
            <span className="text-base font-black" style={{ color: isSelected ? '#050D15' : 'white' }}>
              {fmt(opt.amount)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── ActionModal (rebuy / addon) — suporta Simples, Simples+Opcional, Duplo ──

function ActionModal({ title, baseLabel, baseAmount, taxAmount, baseChips, taxChips, hasDouble, actionLoading, onClose, onConfirm }: {
  title: string
  baseLabel: string
  baseAmount: number
  taxAmount: number
  baseChips: number
  taxChips: number
  hasDouble?: boolean
  actionLoading: string | null
  onClose: () => void
  onConfirm: (type: 'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE') => void
}) {
  const hasTax = taxAmount > 0 && taxChips > 0
  type ActionType = 'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE'
  const [selected, setSelected] = useState<ActionType>('NORMAL')

  const options: { key: ActionType; label: string; amount: number; chips: number; color: string; glow: string }[] = [
    { key: 'NORMAL', label: baseLabel, amount: baseAmount, chips: baseChips, color: 'linear-gradient(135deg, #00C8E0 0%, #007A95 100%)', glow: '0 4px 16px rgba(0,200,224,0.3)' },
    ...(hasTax ? [{ key: 'NORMAL_WITH_TAX' as const, label: `${baseLabel} + Opcional`, amount: baseAmount + taxAmount, chips: baseChips + taxChips, color: 'linear-gradient(135deg, #00E0A0 0%, #00957A 100%)', glow: '0 4px 16px rgba(0,224,160,0.3)' }] : []),
    ...(hasDouble ? [{ key: 'DOUBLE' as const, label: 'Duplo', amount: (baseAmount + taxAmount) * 2, chips: (baseChips + taxChips) * 2, color: 'linear-gradient(135deg, #FFB800 0%, #CC7000 100%)', glow: '0 4px 16px rgba(255,184,0,0.3)' }] : []),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-md rounded-2xl p-5 space-y-4" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(0,200,224,0.18)' }}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white">✕</button>
        </div>

        <div className="space-y-2">
          {options.map((opt) => {
            const isSelected = selected === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSelected(opt.key)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left"
                style={{
                  background: isSelected ? opt.color : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isSelected ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
                  boxShadow: isSelected ? opt.glow : 'none',
                }}
              >
                <div>
                  <p className="text-sm font-bold" style={{ color: isSelected ? '#050D15' : 'rgba(255,255,255,0.7)' }}>{opt.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: isSelected ? 'rgba(5,13,21,0.6)' : 'rgba(255,255,255,0.35)' }}>
                    {opt.chips.toLocaleString('pt-BR')} fichas
                  </p>
                </div>
                <span className="text-base font-black" style={{ color: isSelected ? '#050D15' : 'white' }}>
                  {fmt(opt.amount)}
                </span>
              </button>
            )
          })}
        </div>

        <button
          onClick={() => onConfirm(selected)}
          disabled={!!actionLoading}
          className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50 btn-sx-primary"
        >
          Confirmar
        </button>
      </div>
    </div>
  )
}

// ─── Payout Modal ─────────────────────────────────────────────────────────────

const STANDARD_PAYOUTS: Record<number, number[]> = {
  1: [100],
  2: [65, 35],
  3: [50, 30, 20],
  4: [40, 30, 20, 10],
  5: [35, 25, 20, 12, 8],
  6: [30, 22, 17, 13, 10, 8],
  7: [27, 20, 15, 13, 10, 9, 6],
  8: [25, 18, 14, 12, 10, 8, 7, 6],
  9: [24, 17, 13, 11, 9, 8, 7, 6, 5],
  10: [22, 16, 12, 10, 9, 8, 7, 6, 5, 5],
}

function getSuggestedPayouts(n: number): number[] {
  if (STANDARD_PAYOUTS[n]) return STANDARD_PAYOUTS[n]
  // Para n > 10: distribui de forma decrescente
  const base = Math.floor(100 / n)
  const arr = Array(n).fill(base)
  let remainder = 100 - base * n
  for (let i = 0; i < remainder; i++) arr[i]++
  return arr
}

function PayoutModal({ payout, players, tournamentId, actionLoading, onClose, onPay, onFinishByDeal, onSetDealPayouts, onSetPayoutStructure }: {
  payout: PayoutSuggestion
  players: TournamentPlayer[]
  tournamentId: string
  actionLoading: string | null
  onClose: () => void
  onPay: (playerId: string, amount: number) => Promise<void>
  onFinishByDeal: () => Promise<void>
  onSetDealPayouts: (payouts: { position: number; amount: number }[]) => Promise<void>
  onSetPayoutStructure: (structure: { position: number; percent: number }[]) => Promise<void>
}) {
  const prizePool = Number(payout.prizePool)
  const paid = new Set(players.filter((p) => p.prizeAmount).map((p) => p.id))
  const eligible = players.filter((p) => p.status !== 'ELIMINATED' && !paid.has(p.id))

  type DealType = 'full' | 'positions' | 'partial'
  // step: 'overview' = posições + estrutura sugerida, 'structure' = editar %s, 'deal' = acordo
  const [step, setStep] = useState<'overview' | 'structure' | 'deal'>('overview')
  const [numPositions, setNumPositions] = useState(Math.min(3, eligible.length || 1))
  const [percents, setPercents] = useState<number[]>([])
  const [dealType, setDealType] = useState<DealType | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const alreadyPaid = players.reduce((s, p) => s + Number(p.prizeAmount ?? 0), 0)
  const remainingPot = Math.max(0, prizePool - alreadyPaid)
  const activeDealPlayers = players.filter((p) => ['REGISTERED', 'ACTIVE'].includes(p.status))
  const n = activeDealPlayers.length || 1

  const [dealMode, setDealMode] = useState<'pct' | 'fixed'>('fixed')
  const [dealValues, setDealValues] = useState<Record<string, string>>({})
  const [saveValues, setSaveValues] = useState<Record<string, string>>({})
  const [positionAmounts, setPositionAmounts] = useState<{ position: number; amount: number; locked: boolean }[]>([])

  const initEqualValues = (pot: number, mode: 'pct' | 'fixed') => {
    const init: Record<string, string> = {}
    activeDealPlayers.forEach((p) => {
      init[p.id] = mode === 'pct' ? (100 / n).toFixed(1) : (pot / n).toFixed(2)
    })
    return init
  }

  const handleConfirmPositions = () => {
    setPercents(getSuggestedPayouts(numPositions))
    setStep('structure')
  }

  const handleSelectDeal = (type: DealType) => {
    setDealType(type)
    if (type === 'full') {
      setDealValues(initEqualValues(remainingPot, 'fixed'))
      setDealMode('fixed')
    } else if (type === 'partial') {
      setSaveValues(initEqualValues(remainingPot / 2, 'fixed'))
    } else if (type === 'positions') {
      const pcts = getSuggestedPayouts(n)
      const lastPct = pcts[n - 1] ?? 0
      const lockedLast = Math.round(remainingPot * lastPct / 100 * 100) / 100
      const dealPot = Math.round((remainingPot - lockedLast) * 100) / 100
      const topPcts = getSuggestedPayouts(Math.max(1, n - 1))
      const amounts: { position: number; amount: number; locked: boolean }[] = Array.from(
        { length: n - 1 }, (_, i) => ({
          position: i + 1,
          amount: Math.round(dealPot * (topPcts[i] ?? 0) / 100 * 100) / 100,
          locked: false,
        })
      )
      const topTotal = amounts.reduce((s, a) => s + a.amount, 0)
      if (amounts.length > 0) amounts[0].amount = Math.round((amounts[0].amount + dealPot - topTotal) * 100) / 100
      amounts.push({ position: n, amount: lockedLast, locked: true })
      setPositionAmounts(amounts)
    }
    setStep('deal')
  }

  // Tipo 1
  const dealTotal = activeDealPlayers.reduce((s, p) => {
    const v = parseFloat(dealValues[p.id] || '0') || 0
    return s + (dealMode === 'pct' ? (remainingPot * v) / 100 : v)
  }, 0)
  const dealBalanced = Math.abs(dealTotal - remainingPot) < 0.02

  // Tipo 2
  const lockedAmount = positionAmounts.filter((a) => a.locked).reduce((s, a) => s + a.amount, 0)
  const dealPotForValidation = Math.round((remainingPot - lockedAmount) * 100) / 100
  const editableTotal = positionAmounts.filter((a) => !a.locked).reduce((s, a) => s + a.amount, 0)
  const positionsValid = positionAmounts.length > 0
    && positionAmounts.every((a) => a.amount >= 0)
    && Math.abs(editableTotal - dealPotForValidation) < 0.02

  // Tipo 3
  const saveTotal = activeDealPlayers.reduce((s, p) => s + (parseFloat(saveValues[p.id] || '0') || 0), 0)
  const remainingAfterSave = remainingPot - saveTotal
  const saveValid = saveTotal > 0 && remainingAfterSave >= 0.01

  const handleConfirmDeal = async () => {
    if (dealType === 'full') {
      for (const p of activeDealPlayers) {
        const v = parseFloat(dealValues[p.id] || '0') || 0
        const amount = dealMode === 'pct' ? (remainingPot * v) / 100 : v
        if (amount > 0) await onPay(p.id, Math.round(amount * 100) / 100)
      }
      await onFinishByDeal()
    } else if (dealType === 'positions') {
      await onSetDealPayouts(positionAmounts.map(({ position, amount }) => ({ position, amount })))
    } else if (dealType === 'partial') {
      for (const p of activeDealPlayers) {
        const amount = parseFloat(saveValues[p.id] || '0') || 0
        if (amount > 0) await onPay(p.id, Math.round(amount * 100) / 100)
      }
    }
    setSuccess(
      dealType === 'partial'
        ? `Saves registrados! R$ ${remainingAfterSave.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} continuam em jogo.`
        : dealType === 'positions'
        ? 'Acordo salvo! Prêmios aplicados automaticamente conforme as posições forem determinadas.'
        : 'Acordo registrado!'
    )
    setTimeout(() => { setSuccess(null); onClose() }, 3000)
  }

  const totalPercent = percents.reduce((a, b) => a + b, 0)
  const medal = (pos: number) => pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `${pos}º`

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4" style={{ backdropFilter: 'blur(4px)' }}>
      <div className="bg-sx-card rounded-2xl w-full max-w-md p-4 space-y-4 max-h-[85vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step !== 'overview' && (
              <button
                onClick={() => { setStep('overview'); setDealType(null) }}
                className="text-white/40 hover:text-white text-lg"
              >←</button>
            )}
            <h3 className="font-semibold">
              {step === 'deal' ? '🤝 Acordo' : 'Distribuição de Prêmios'}
            </h3>
          </div>
          <button onClick={onClose} className="text-white/40">✕</button>
        </div>

        <div className="text-center">
          <div className="text-xs text-white/40">Prize Pool Total</div>
          <div className="text-2xl font-bold text-green-400">{fmt(payout.prizePool)}</div>
        </div>

        {success && (
          <div className="bg-sx-cyan-deep/40 border border-sx-cyan-dim rounded-lg px-3 py-2 text-sm text-sx-cyan text-center">
            {success}
          </div>
        )}

        {/* ── Step overview: posições + acordo ── */}
        {step === 'overview' && (
          <div className="space-y-4">
            {/* Seletor de quantidade de posições */}
            <div>
              <label className="text-xs text-white/50 uppercase tracking-widest font-medium">Quantas posições serão premiadas?</label>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={() => setNumPositions((prev) => Math.max(1, prev - 1))}
                  className="w-10 h-10 rounded-xl text-xl font-bold flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.08)' }}
                >−</button>
                <div className="flex-1 text-center text-3xl font-bold text-white">{numPositions}</div>
                <button
                  onClick={() => setNumPositions((prev) => Math.min(eligible.length || 10, prev + 1))}
                  className="w-10 h-10 rounded-xl text-xl font-bold flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.08)' }}
                >+</button>
              </div>
            </div>
            <button
              onClick={handleConfirmPositions}
              className="w-full py-3 rounded-xl font-semibold text-sm btn-sx-primary"
            >
              Ver estrutura sugerida →
            </button>

            {/* Botões de acordo */}
            {activeDealPlayers.length >= 2 && remainingPot > 0 && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
                <div className="text-xs text-white/30 text-center mb-3">
                  🤝 Acordo — R$ {remainingPot.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em jogo
                  {alreadyPaid > 0 && ` · R$ ${alreadyPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} já pagos`}
                </div>
                <div className="space-y-2">
                  {([
                    { type: 'full' as const, label: '💰 Dividir tudo e encerrar', desc: 'Cada jogador recebe sua parte agora. Jogo encerra.' },
                    { type: 'positions' as const, label: '🏆 Redistribuir premiação nas posições', desc: 'Redistribuição do prêmio restante entre as posições. Torneio continua.' },
                    { type: 'partial' as const, label: '🛡️ Salvar parte e continuar', desc: 'Cada um garante uma parte agora. O resto ainda é disputado.' },
                  ]).map(({ type, label, desc }) => (
                    <button key={type} onClick={() => handleSelectDeal(type)}
                      className="w-full text-left px-4 py-3 rounded-xl"
                      style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)' }}
                    >
                      <div className="text-sm font-semibold text-yellow-400">{label}</div>
                      <div className="text-xs text-white/30 mt-0.5">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step structure: editar percentuais ── */}
        {step === 'structure' && (
          <div className="space-y-3">
            <p className="text-xs text-white/40">Ajuste os percentuais. Total deve ser 100%.</p>
            <div className="space-y-2">
              {percents.map((pct, i) => {
                const amount = (prizePool * pct) / 100
                return (
                  <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <span className="text-sm w-6 text-white/50">{medal(i + 1)}</span>
                    <div className="flex items-center gap-1 flex-1">
                      <input
                        type="number" min={1} max={100} value={pct}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                          setPercents((arr) => arr.map((x, j) => j === i ? v : x))
                        }}
                        className="w-16 bg-sx-input border border-sx-border2 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:border-sx-cyan"
                      />
                      <span className="text-white/40 text-sm">%</span>
                    </div>
                    <span className="text-sm font-semibold text-sx-cyan">{fmt(amount)}</span>
                  </div>
                )
              })}
            </div>
            <div className={`flex justify-between text-sm font-medium px-1 ${totalPercent === 100 ? 'text-sx-cyan' : 'text-red-400'}`}>
              <span>Total</span>
              <span>{totalPercent}%{totalPercent !== 100 ? ` (falta ${100 - totalPercent}%)` : ' ✓'}</span>
            </div>
            <button
              onClick={async () => {
                const structure = percents.map((pct, i) => ({ position: i + 1, percent: pct }))
                await onSetPayoutStructure(structure)
                onClose()
              }}
              disabled={totalPercent !== 100 || !!actionLoading}
              className="w-full py-3 rounded-xl font-semibold text-sm btn-sx-primary disabled:opacity-40"
            >
              {actionLoading === 'set-payout-structure' ? 'Salvando...' : '✓ Salvar e exibir no clock'}
            </button>
          </div>
        )}

        {/* ── Resumo do pot quando em modo deal ── */}
        {step === 'deal' && (
          <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)' }}>
            <div className="text-xs text-yellow-600 uppercase tracking-widest mb-1">
              {dealType === 'full' ? 'Dividir e encerrar' : dealType === 'positions' ? 'Redistribuir posições' : 'Salvar parte · continuar'}
            </div>
            <div className="text-2xl font-bold text-yellow-400">
              R$ {remainingPot.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            {alreadyPaid > 0 && (
              <div className="text-xs text-white/30 mt-1">
                R$ {alreadyPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} já pagos a eliminados
              </div>
            )}
          </div>
        )}

        {/* ── Tipo 1: dividir tudo ── */}
        {step === 'deal' && dealType === 'full' && (<>
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
            {(['fixed', 'pct'] as const).map((mode) => (
              <button key={mode} onClick={() => {
                const init: Record<string, string> = {}
                activeDealPlayers.forEach((p) => {
                  const cur = parseFloat(dealValues[p.id] || '0') || 0
                  init[p.id] = mode === 'pct' && dealMode === 'fixed'
                    ? (remainingPot > 0 ? (cur / remainingPot * 100).toFixed(1) : (100 / n).toFixed(1))
                    : mode === 'fixed' && dealMode === 'pct'
                    ? ((remainingPot * cur) / 100).toFixed(2)
                    : dealValues[p.id]
                })
                setDealValues(init); setDealMode(mode)
              }}
                className="flex-1 py-2 text-sm font-semibold"
                style={{ background: dealMode === mode ? 'rgba(0,200,224,0.2)' : 'transparent', color: dealMode === mode ? '#00C8E0' : 'rgba(255,255,255,0.4)' }}
              >{mode === 'fixed' ? 'R$ fixo' : 'Porcentagem %'}</button>
            ))}
          </div>
          <div className="space-y-2">
            {activeDealPlayers.map((p) => {
              const v = parseFloat(dealValues[p.id] || '0') || 0
              const amount = dealMode === 'pct' ? (remainingPot * v) / 100 : v
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.player.name}</div>
                    {dealMode === 'pct' && <div className="text-xs text-white/30">= R$ {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-white/40 text-sm">{dealMode === 'pct' ? '%' : 'R$'}</span>
                    <input type="number" min={0} step={dealMode === 'pct' ? 0.1 : 0.01}
                      value={dealValues[p.id] ?? ''}
                      onChange={(e) => setDealValues((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      className="w-24 bg-sx-input border border-sx-border2 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:border-sx-cyan"
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className={`flex justify-between text-sm font-semibold px-1 ${dealBalanced ? 'text-sx-cyan' : 'text-red-400'}`}>
            <span>Total</span>
            <span>R$ {dealTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              {!dealBalanced && <span className="text-xs font-normal ml-1">({dealTotal > remainingPot ? '+' : '−'}R$ {Math.abs(dealTotal - remainingPot).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</span>}
              {dealBalanced && ' ✓'}
            </span>
          </div>
          <button disabled={!dealBalanced || !!actionLoading} onClick={handleConfirmDeal}
            className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-40"
            style={{ background: dealBalanced ? '#EAB308' : 'rgba(234,179,8,0.3)', color: '#000' }}
          >{actionLoading ? 'Registrando...' : '✓ Dividir e encerrar'}</button>
        </>)}

        {/* ── Tipo 2: redistribuir por posição ── */}
        {step === 'deal' && dealType === 'positions' && (<>
          <p className="text-xs text-white/40">
            O último lugar recebe o prêmio padrão (bloqueado). Distribua o restante entre as posições acima.
          </p>
          <div className="space-y-2">
            {positionAmounts.filter((e) => !e.locked).map((entry) => {
              const medalIcon = entry.position === 1 ? '🥇' : entry.position === 2 ? '🥈' : entry.position === 3 ? '🥉' : `${entry.position}º`
              const pct = dealPotForValidation > 0 ? (entry.amount / dealPotForValidation * 100).toFixed(1) : '0.0'
              const editableIndex = positionAmounts.findIndex((x) => x.position === entry.position)
              return (
                <div key={entry.position} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="w-8 text-center text-base">{medalIcon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">{entry.position}º lugar</div>
                    <div className="text-xs text-white/30">{pct}% do pot negociável</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-white/40 text-sm">R$</span>
                    <input
                      type="number" min={0} step={0.01}
                      value={entry.amount}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0
                        setPositionAmounts((prev) => prev.map((x, j) => j === editableIndex ? { ...x, amount: Math.round(v * 100) / 100 } : x))
                      }}
                      className="w-28 bg-sx-input border border-sx-border2 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:border-sx-cyan"
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className={`flex justify-between text-sm font-semibold px-1 ${positionsValid ? 'text-sx-cyan' : 'text-red-400'}`}>
            <span>Pot negociável</span>
            <span>
              R$ {editableTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              {' / '}
              R$ {dealPotForValidation.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              {positionsValid && ' ✓'}
              {!positionsValid && (
                <span className="text-xs font-normal ml-1">
                  ({editableTotal > dealPotForValidation ? '+' : '−'}R$ {Math.abs(editableTotal - dealPotForValidation).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                </span>
              )}
            </span>
          </div>
          {positionAmounts.filter((e) => e.locked).map((entry) => (
            <div key={entry.position} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', opacity: 0.7 }}>
              <div className="w-8 text-center text-base">🔒</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white/50">{entry.position}º lugar — prêmio padrão</div>
                <div className="text-xs text-white/30">Bloqueado, não faz parte do acordo</div>
              </div>
              <div className="text-sm font-semibold text-white/50">
                R$ {entry.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          ))}
          <button disabled={!positionsValid || !!actionLoading} onClick={handleConfirmDeal}
            className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-40"
            style={{ background: positionsValid ? '#EAB308' : 'rgba(234,179,8,0.3)', color: '#000' }}
          >{actionLoading ? 'Salvando...' : '✓ Salvar acordo e continuar jogando'}</button>
        </>)}

        {/* ── Tipo 3: save parcial ── */}
        {step === 'deal' && dealType === 'partial' && (<>
          <p className="text-xs text-white/40">Defina quanto cada jogador garante agora. O restante continua sendo disputado normalmente.</p>
          <div className="space-y-2">
            {activeDealPlayers.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex-1 min-w-0 text-sm font-medium truncate">{p.player.name}</div>
                <div className="flex items-center gap-1">
                  <span className="text-white/40 text-sm">R$</span>
                  <input type="number" min={0} step={0.01}
                    value={saveValues[p.id] ?? ''}
                    onChange={(e) => setSaveValues((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    className="w-24 bg-sx-input border border-sx-border2 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:border-sx-cyan"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Saves totais</span>
              <span className={saveTotal > remainingPot ? 'text-red-400' : 'text-white'}>R$ {saveTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-white/50">Continua em jogo</span>
              <span className={remainingAfterSave < 0 ? 'text-red-400' : 'text-yellow-400'}>
                R$ {Math.max(0, remainingAfterSave).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          {saveTotal > remainingPot && <p className="text-xs text-red-400 px-1">Saves ultrapassam o pot disponível.</p>}
          <button disabled={!saveValid || !!actionLoading} onClick={handleConfirmDeal}
            className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-40"
            style={{ background: saveValid ? '#EAB308' : 'rgba(234,179,8,0.3)', color: '#000' }}
          >{actionLoading ? 'Registrando...' : '✓ Registrar saves e continuar'}</button>
        </>)}

      </div>
    </div>
  )
}
