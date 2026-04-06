'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'

interface HomeGame {
  id: string; name: string; address: string; dayOfWeek: string
  gameType?: 'CASH_GAME' | 'TOURNAMENT'
  financialModule?: 'POSTPAID' | 'PREPAID' | 'HYBRID'
  jackpotAccumulated?: string
  startTime: string; chipValue: string; joinCode: string; rules?: string
  buyInAmount?: string
  rebuyAmount?: string
  addOnAmount?: string
  blindsMinutesBeforeBreak?: number
  blindsMinutesAfterBreak?: number
  levelsUntilBreak?: number
  host: { id: string; name: string }
  members: { id: string; paymentMode?: 'POSTPAID' | 'PREPAID' | null; user: { id: string; name: string; email?: string } }[]
  sangeurAccesses?: SangeurAccess[]
}

interface SangeurAccess {
  id: string
  homeGameId: string
  userId: string
  username: string
  isActive: boolean
  mustChangePassword: boolean
  lastLoginAt?: string | null
  createdAt: string
  updatedAt: string
  user: { id: string; name: string; email?: string }
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

type FeedbackState = {
  tone: 'error' | 'success'
  message: string
} | null

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
  const [jackpotAccumulated, setJackpotAccumulated] = useState('0')
  const [newSessionJackpotEnabled, setNewSessionJackpotEnabled] = useState(false)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [newSessionFinancialModule, setNewSessionFinancialModule] = useState<'POSTPAID' | 'PREPAID' | 'HYBRID'>('POSTPAID')
  const [pageFeedback, setPageFeedback] = useState<FeedbackState>(null)
  const [createFormError, setCreateFormError] = useState<string | null>(null)
  const [confirmCancelSessionId, setConfirmCancelSessionId] = useState<string | null>(null)
  const [sangeurAccesses, setSangeurAccesses] = useState<SangeurAccess[]>([])
  const [sangeurUserId, setSangeurUserId] = useState('')
  const [sangeurUsername, setSangeurUsername] = useState('')
  const [sangeurPassword, setSangeurPassword] = useState('')
  const [sangeurLoading, setSangeurLoading] = useState(false)
  const [sangeurActionUserId, setSangeurActionUserId] = useState<string | null>(null)
  const [sangeurError, setSangeurError] = useState<string | null>(null)
  const [issuedCredential, setIssuedCredential] = useState<{ userName: string; username: string; temporaryPassword: string } | null>(null)

  useEffect(() => {
    async function loadPage() {
      try {
        const [g, s] = await Promise.all([
          api.get(`/home-games/${id}`),
          api.get(`/sessions/home-game/${id}`)
        ])

        setGame(g.data)
        setSangeurAccesses(g.data.sangeurAccesses || [])
        setNewSessionFinancialModule(g.data.financialModule || 'POSTPAID')
        setSessions(s.data)
      } finally {
        setLoading(false)
      }
    }

    loadPage()
  }, [id])

  function applySangeurAccess(access: SangeurAccess) {
    setSangeurAccesses((prev) => {
      const existingIndex = prev.findIndex((item) => item.userId === access.userId)
      if (existingIndex === -1) return [access, ...prev]

      const clone = [...prev]
      clone[existingIndex] = access
      return clone
    })
  }

  async function handleEnableSangeur() {
    if (!sangeurUserId) {
      setSangeurError('Selecione um participante para habilitar como SANGEUR.')
      return
    }
    if (!sangeurUsername.trim()) {
      setSangeurError('Informe o usuario da SANGEUR para POS.')
      return
    }

    setSangeurError(null)
    setSangeurLoading(true)
    try {
      const payload: Record<string, string> = {
        userId: sangeurUserId,
        username: sangeurUsername.trim(),
      }
      if (sangeurPassword.trim()) payload.password = sangeurPassword.trim()

      const { data } = await api.post(`/home-games/${id}/sangeurs`, payload)
      applySangeurAccess(data.access)

      setIssuedCredential({
        userName: data.access.user.name,
        username: data.access.username,
        temporaryPassword: data.temporaryPassword,
      })
      setSangeurPassword('')
      setPageFeedback({ tone: 'success', message: 'SANGEUR habilitada com sucesso.' })
    } catch (err) {
      setSangeurError(typeof err === 'string' ? err : 'Nao foi possivel habilitar a SANGEUR.')
    } finally {
      setSangeurLoading(false)
    }
  }

  async function handleDisableSangeur(userId: string) {
    setSangeurActionUserId(userId)
    setSangeurError(null)
    try {
      const { data } = await api.patch(`/home-games/${id}/sangeurs/${userId}/disable`)
      applySangeurAccess(data)
      setPageFeedback({ tone: 'success', message: 'Acesso de SANGEUR desabilitado.' })
    } catch (err) {
      setSangeurError(typeof err === 'string' ? err : 'Nao foi possivel desabilitar a SANGEUR.')
    } finally {
      setSangeurActionUserId(null)
    }
  }

  async function handleResetSangeurPassword(userId: string) {
    setSangeurActionUserId(userId)
    setSangeurError(null)
    try {
      const { data } = await api.patch(`/home-games/${id}/sangeurs/${userId}/reset-password`, {})
      applySangeurAccess(data.access)
      setIssuedCredential({
        userName: data.access.user.name,
        username: data.access.username,
        temporaryPassword: data.temporaryPassword,
      })
      setPageFeedback({ tone: 'success', message: 'Senha temporaria da SANGEUR redefinida.' })
    } catch (err) {
      setSangeurError(typeof err === 'string' ? err : 'Nao foi possivel redefinir a senha da SANGEUR.')
    } finally {
      setSangeurActionUserId(null)
    }
  }

  function openCreatePicker() {
    if (!game) return
    setCreateFormError(null)
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
    setJackpotAccumulated(String(game.jackpotAccumulated ?? '0'))
    setNewSessionJackpotEnabled(false)
    setShowCreatePicker(true)
  }

  async function createSession() {
    setCreateFormError(null)
    setPageFeedback(null)
    setCreating(true)
    try {
      let payload: Record<string, string | number | boolean> = {
        homeGameId: id,
        pokerVariant,
        gameType: newSessionType,
        financialModule: newSessionFinancialModule,
        jackpotEnabled: newSessionJackpotEnabled,
      }

      if (newSessionType === 'CASH_GAME') {
        const chipValue = parseFloat(cashChipValue)
        const smallBlind = parseFloat(cashSmallBlind)
        const bigBlind = parseFloat(cashBigBlind)
        const minimumBuyIn = parseFloat(cashMinimumBuyIn)
        const minimumStayMinutes = parseInt(cashMinimumStayMinutes, 10)
        const foodFee = parseFloat(cashFoodFee)

        if (!(chipValue > 0)) {
          setCreateFormError('Informe um valor/ficha valido para o cash game.')
          return
        }
        if (!(smallBlind >= 0) || !(bigBlind > 0) || bigBlind < smallBlind) {
          setCreateFormError('Informe blinds validos para o cash game.')
          return
        }
        if (!(minimumBuyIn >= 0) || !(minimumStayMinutes >= 0) || !(foodFee >= 0)) {
          setCreateFormError('Minimo de entrada, permanencia e taxa de alimentacao devem ser maiores ou iguais a zero.')
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
          setCreateFormError('Informe um buy-in valido para o torneio.')
          return
        }
        if (!(rebuyAmount >= 0) || !(addOnAmount >= 0)) {
          setCreateFormError('Rebuy e add-on devem ser maiores ou iguais a zero.')
          return
        }
        if (!(blindsMinutesBeforeBreak > 0) || !(blindsMinutesAfterBreak > 0) || !(levelsUntilBreak > 0)) {
          setCreateFormError('Estrutura do torneio invalida. Verifique os tempos e niveis.')
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
    } catch (err) {
      setCreateFormError(typeof err === 'string' ? err : 'Nao foi possivel criar a partida.')
    } finally {
      setCreating(false)
    }
  }

  async function cancelSession(sessionId: string) {
    setPageFeedback(null)
    setConfirmCancelSessionId(sessionId)
  }

  async function confirmCancelSession() {
    if (!confirmCancelSessionId) return

    setDeletingSessionId(confirmCancelSessionId)
    try {
      await api.delete(`/sessions/${confirmCancelSessionId}`)
      setSessions((prev) => prev.filter((s) => s.id !== confirmCancelSessionId))
      setPageFeedback({ tone: 'success', message: 'Partida cancelada e removida com sucesso.' })
      setConfirmCancelSessionId(null)
    } catch (err) {
      const message = typeof err === 'string' ? err : 'Nao foi possivel cancelar a partida'
      setPageFeedback({ tone: 'error', message })
    } finally {
      setDeletingSessionId(null)
    }
  }

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><div className="text-yellow-400 text-2xl font-black">STACKPLUS</div></div>
  if (!game) return null
  const gameType = game.gameType || 'CASH_GAME'
  const isHost = user?.id === game.host.id
  const selectedSangeurAccess = sangeurAccesses.find((item) => item.userId === sangeurUserId)

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
        {pageFeedback && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${pageFeedback.tone === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
            {pageFeedback.message}
          </div>
        )}

        {isHost && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">SANGEUR POS</h2>
                <p className="mt-1 text-xs text-zinc-500">Somente o host habilita participantes para acesso POS com usuario e senha.</p>
              </div>
              <span className="rounded-full border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-300">Host</span>
            </div>

            {sangeurError && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {sangeurError}
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 uppercase tracking-wide">Participante</label>
                <select
                  value={sangeurUserId}
                  onChange={(e) => {
                    const nextUserId = e.target.value
                    setSangeurUserId(nextUserId)
                    const existing = sangeurAccesses.find((item) => item.userId === nextUserId)
                    if (existing) setSangeurUsername(existing.username)
                  }}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none"
                >
                  <option value="">Selecione...</option>
                  {game.members.map((member) => (
                    <option key={member.user.id} value={member.user.id}>{member.user.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 uppercase tracking-wide">Usuario POS</label>
                <input
                  type="text"
                  value={sangeurUsername}
                  onChange={(e) => setSangeurUsername(e.target.value)}
                  placeholder="ex: mesa-sangeur"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 uppercase tracking-wide">Senha temporaria (opcional)</label>
                <input
                  type="text"
                  value={sangeurPassword}
                  onChange={(e) => setSangeurPassword(e.target.value)}
                  placeholder="gerada automaticamente"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-500">
                {selectedSangeurAccess
                  ? `Participante ja possui acesso (${selectedSangeurAccess.isActive ? 'ativo' : 'desativado'}). Ao salvar, as credenciais serao atualizadas.`
                  : 'A senha temporaria sera exibida uma unica vez apos habilitar.'}
              </p>
              <button
                type="button"
                onClick={handleEnableSangeur}
                disabled={sangeurLoading}
                className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-bold text-zinc-900 hover:bg-yellow-300 disabled:opacity-50"
              >
                {sangeurLoading ? 'Salvando...' : 'Habilitar / Atualizar SANGEUR'}
              </button>
            </div>

            {issuedCredential && (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-200">Credencial gerada</p>
                <p className="mt-1 text-sm text-zinc-100">Participante: {issuedCredential.userName}</p>
                <p className="text-sm text-zinc-100">Usuario: <span className="font-semibold text-emerald-300">{issuedCredential.username}</span></p>
                <p className="text-sm text-zinc-100">Senha temporaria: <span className="font-semibold text-emerald-300">{issuedCredential.temporaryPassword}</span></p>
                <p className="mt-2 text-xs text-emerald-100/80">Guarde esta senha agora. No primeiro login POS, a SANGEUR deve trocar a senha.</p>
              </div>
            )}

            <div className="mt-5 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">SANGEURs habilitadas</p>
              {sangeurAccesses.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-700 px-4 py-6 text-center text-sm text-zinc-500">
                  Nenhuma SANGEUR configurada para este Home Game.
                </div>
              ) : (
                <div className="space-y-2">
                  {sangeurAccesses.map((access) => (
                    <div key={access.id} className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-zinc-100">{access.user.name}</p>
                        <p className="text-xs text-zinc-500">@{access.username} • ultimo login: {access.lastLoginAt ? new Date(access.lastLoginAt).toLocaleString('pt-BR') : 'nunca'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${access.isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-700 text-zinc-300'}`}>
                          {access.isActive ? 'Ativa' : 'Desativada'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleResetSangeurPassword(access.userId)}
                          disabled={sangeurActionUserId === access.userId}
                          className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                        >
                          Resetar senha
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDisableSangeur(access.userId)}
                          disabled={sangeurActionUserId === access.userId || !access.isActive}
                          className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                        >
                          Desabilitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

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

            {createFormError && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {createFormError}
              </div>
            )}

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

            <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-800/50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">JACKPOT</p>
              <p className="mt-1 text-xs text-zinc-500">Informe o valor do JACKPOT acumulado para esta partida.</p>
              <div className="mt-3 space-y-1">
                <label className={`text-xs uppercase tracking-wide ${newSessionJackpotEnabled ? 'text-zinc-400' : 'text-zinc-600'}`}>JACKPOT acumulado (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={jackpotAccumulated}
                  onChange={(e) => setJackpotAccumulated(e.target.value)}
                  disabled={!newSessionJackpotEnabled}
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none ${newSessionJackpotEnabled ? 'border-zinc-700 bg-zinc-900 focus:border-yellow-400' : 'cursor-not-allowed border-zinc-800 bg-zinc-900/50 text-zinc-600'}`}
                />
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setNewSessionJackpotEnabled((prev) => !prev)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${
                    newSessionJackpotEnabled
                      ? 'border-emerald-400 bg-emerald-400/15 text-emerald-300'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {newSessionJackpotEnabled ? 'Desabilitar JACKPOT na partida' : 'Habilitar JACKPOT na partida'}
                </button>
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
                onClick={() => {
                  setShowCreatePicker(false)
                  setCreateFormError(null)
                }}
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

      {confirmCancelSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-zinc-900 p-6">
            <h3 className="text-lg font-bold text-white">Cancelar partida</h3>
            <p className="mt-2 text-sm text-zinc-300">
              Esta acao vai remover a partida e todos os dados vinculados. Nao podera ser desfeita.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmCancelSessionId(null)}
                disabled={deletingSessionId === confirmCancelSessionId}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={confirmCancelSession}
                disabled={deletingSessionId === confirmCancelSessionId}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deletingSessionId === confirmCancelSessionId ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
