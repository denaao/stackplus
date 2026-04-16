'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
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
  const searchParams = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const id = params.id as string
  const [game, setGame] = useState<HomeGame | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreatePicker, setShowCreatePicker] = useState(false)
  const [pokerVariant, setPokerVariant] = useState<'HOLDEN' | 'BUTTON_CHOICE' | 'PINEAPPLE' | 'OMAHA' | 'OMAHA_FIVE' | 'OMAHA_SIX'>('HOLDEN')
  const [wizardStep, setWizardStep] = useState<1 | 2>(1)
  const [sessionHasSangeur, setSessionHasSangeur] = useState<boolean>(false)
  const [cashChipValue, setCashChipValue] = useState('1')
  const [cashSmallBlind, setCashSmallBlind] = useState('1')
  const [cashBigBlind, setCashBigBlind] = useState('2')
  const [cashMinimumBuyIn, setCashMinimumBuyIn] = useState('0')
  const [cashMinimumStayMinutes, setCashMinimumStayMinutes] = useState('0')
  const [cashFoodFee, setCashFoodFee] = useState('0')
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

  useEffect(() => {
    if (!game || loading) return
    if (searchParams?.get('new') === 'cash' && user?.id === game.host.id && !showCreatePicker) {
      openCreatePicker()
      router.replace(`/homegame/${id}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, loading, searchParams])

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
    setWizardStep(1)
    setPokerVariant('HOLDEN')
    setNewSessionFinancialModule(game.financialModule || 'POSTPAID')
    setSessionHasSangeur(false)
    setCashChipValue(String(game.chipValue || '1'))
    setCashSmallBlind('1')
    setCashBigBlind('2')
    setCashMinimumBuyIn('0')
    setCashMinimumStayMinutes('0')
    setCashFoodFee('0')
    setJackpotAccumulated(String(game.jackpotAccumulated ?? '0'))
    setNewSessionJackpotEnabled(false)
    setShowCreatePicker(true)
  }

  async function createSession() {
    setCreateFormError(null)
    setPageFeedback(null)
    setCreating(true)
    try {
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

      const payload: Record<string, string | number | boolean> = {
        homeGameId: id,
        pokerVariant,
        gameType: 'CASH_GAME',
        financialModule: newSessionFinancialModule,
        jackpotEnabled: newSessionJackpotEnabled,
        chipValue,
        smallBlind,
        bigBlind,
        minimumBuyIn,
        minimumStayMinutes,
        foodFee,
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

        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold">Sessões de Cash Game</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Cada partida começa com as perguntas de configuração (financeiro, sangeur, jackpot).
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

        {/* ─── Torneios ─── */}
        <TournamentsSection homeGameId={id} isHost={isHost} router={router} />

      </main>

      {showCreatePicker && isHost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Nova Partida</h3>
              <span className="text-xs font-bold text-zinc-400">Passo {wizardStep} de 2</span>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              {wizardStep === 1 ? 'Configuração da partida: financeiro, sangeur e jackpot.' : 'Parâmetros do Cash Game.'}
            </p>

            {createFormError && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {createFormError}
              </div>
            )}

            {wizardStep === 1 && (
              <>
                <div className="mt-5 rounded-xl border border-zinc-700 bg-zinc-800/50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">1. Módulo financeiro</p>
                  <p className="mt-1 text-xs text-zinc-500">Pós-pago, pré-pago ou híbrido?</p>
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
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">2. SANGEUR</p>
                  <p className="mt-1 text-xs text-zinc-500">Esta partida tem SANGEUR (caixa móvel)?</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSessionHasSangeur(true)}
                      className={`rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${
                        sessionHasSangeur
                          ? 'border-yellow-400 bg-yellow-400/15 text-yellow-300'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      Sim
                    </button>
                    <button
                      type="button"
                      onClick={() => setSessionHasSangeur(false)}
                      className={`rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${
                        !sessionHasSangeur
                          ? 'border-yellow-400 bg-yellow-400/15 text-yellow-300'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      Não
                    </button>
                  </div>

                  {sessionHasSangeur && (
                    <div className="mt-4 space-y-3 rounded-lg border border-zinc-700 bg-zinc-900/70 p-3">
                      <div className="space-y-1">
                        <label className="text-xs uppercase tracking-wide text-zinc-400">Participante SANGEUR</label>
                        <select
                          value={sangeurUserId}
                          onChange={(e) => setSangeurUserId(e.target.value)}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none"
                        >
                          <option value="">Selecione um membro…</option>
                          {game.members.map((m) => (
                            <option key={m.id} value={m.user.id}>{m.user.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs uppercase tracking-wide text-zinc-400">Usuário POS</label>
                          <input
                            type="text"
                            value={sangeurUsername}
                            onChange={(e) => setSangeurUsername(e.target.value)}
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs uppercase tracking-wide text-zinc-400">Senha (opcional)</label>
                          <input
                            type="text"
                            value={sangeurPassword}
                            onChange={(e) => setSangeurPassword(e.target.value)}
                            placeholder="Gerada se vazio"
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none"
                          />
                        </div>
                      </div>

                      {sangeurError && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                          {sangeurError}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleEnableSangeur}
                        disabled={sangeurLoading}
                        className="w-full rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        {sangeurLoading
                          ? 'Salvando…'
                          : selectedSangeurAccess
                          ? 'Atualizar acesso'
                          : 'Habilitar SANGEUR'}
                      </button>

                      {issuedCredential && (
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                          {issuedCredential.userName}: <span className="font-mono">{issuedCredential.username}</span> / <span className="font-mono">{issuedCredential.temporaryPassword}</span>
                        </div>
                      )}

                      {sangeurAccesses.length > 0 && (
                        <div className="space-y-2 border-t border-zinc-800 pt-3">
                          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Acessos cadastrados</p>
                          {sangeurAccesses.map((access) => (
                            <div key={access.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs">
                              <div>
                                <p className="font-bold text-zinc-200">{access.user.name}</p>
                                <p className="text-zinc-500 font-mono">{access.username}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${access.isActive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-700 text-zinc-400'}`}>
                                  {access.isActive ? 'Ativo' : 'Inativo'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleResetSangeurPassword(access.userId)}
                                  disabled={sangeurActionUserId === access.userId}
                                  className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] font-bold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                                >
                                  Reset
                                </button>
                                {access.isActive && (
                                  <button
                                    type="button"
                                    onClick={() => handleDisableSangeur(access.userId)}
                                    disabled={sangeurActionUserId === access.userId}
                                    className="rounded border border-red-500/40 px-2 py-0.5 text-[10px] font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                                  >
                                    Desativar
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-800/50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">3. JACKPOT</p>
                  <p className="mt-1 text-xs text-zinc-500">Esta partida tem JACKPOT?</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewSessionJackpotEnabled(true)}
                      className={`rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${
                        newSessionJackpotEnabled
                          ? 'border-yellow-400 bg-yellow-400/15 text-yellow-300'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      Sim
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewSessionJackpotEnabled(false)}
                      className={`rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${
                        !newSessionJackpotEnabled
                          ? 'border-yellow-400 bg-yellow-400/15 text-yellow-300'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      Não
                    </button>
                  </div>

                  {newSessionJackpotEnabled && (
                    <div className="mt-3 space-y-1">
                      <label className="text-xs uppercase tracking-wide text-zinc-400">JACKPOT acumulado (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={jackpotAccumulated}
                        onChange={(e) => setJackpotAccumulated(e.target.value)}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {wizardStep === 2 && (
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
                    <label className="text-xs text-zinc-400 uppercase tracking-wide">Mínimo entrada (R$)</label>
                    <input type="number" min="0" step="0.01" value={cashMinimumBuyIn} onChange={(e) => setCashMinimumBuyIn(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 uppercase tracking-wide">Min. permanência (min)</label>
                    <input type="number" min="0" step="1" value={cashMinimumStayMinutes} onChange={(e) => setCashMinimumStayMinutes(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-zinc-400 uppercase tracking-wide">Taxa alimentação (R$)</label>
                    <input type="number" min="0" step="0.01" value={cashFoodFee} onChange={(e) => setCashFoodFee(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-yellow-400 focus:outline-none" />
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (wizardStep === 2) {
                    setWizardStep(1)
                    setCreateFormError(null)
                  } else {
                    setShowCreatePicker(false)
                    setCreateFormError(null)
                  }
                }}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-800"
              >
                {wizardStep === 2 ? 'Voltar' : 'Cancelar'}
              </button>
              {wizardStep === 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setCreateFormError(null)
                    if (sessionHasSangeur && sangeurAccesses.filter((a) => a.isActive).length === 0) {
                      setCreateFormError('Habilite ao menos uma SANGEUR antes de prosseguir.')
                      return
                    }
                    setWizardStep(2)
                  }}
                  className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-bold text-zinc-900 hover:bg-yellow-300"
                >
                  Próximo
                </button>
              ) : (
                <button
                  type="button"
                  onClick={createSession}
                  disabled={creating}
                  className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-bold text-zinc-900 hover:bg-yellow-300 disabled:opacity-50"
                >
                  {creating ? 'Criando...' : 'Criar Partida'}
                </button>
              )}
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

// ─── Tournaments Section ──────────────────────────────────────────────────────

function TournamentsSection({ homeGameId, isHost, router }: {
  homeGameId: string
  isHost: boolean
  router: any
}) {
  const [tournaments, setTournaments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/tournaments', { params: { homeGameId } })
      .then((r) => setTournaments(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [homeGameId])

  const statusBadge: Record<string, string> = {
    REGISTRATION: 'text-blue-300 bg-blue-400/10',
    RUNNING: 'text-green-300 bg-green-400/10',
    ON_BREAK: 'text-yellow-300 bg-yellow-400/10',
    FINISHED: 'text-zinc-400 bg-zinc-400/10',
    CANCELED: 'text-red-400 bg-red-400/10',
  }
  const statusLabel: Record<string, string> = {
    REGISTRATION: 'Inscrições',
    RUNNING: 'Rodando',
    ON_BREAK: 'Intervalo',
    FINISHED: 'Finalizado',
    CANCELED: 'Cancelado',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">Torneios</h2>
          <p className="mt-1 text-xs text-zinc-500">Crie e gerencie torneios com comanda por jogador.</p>
        </div>
        {isHost && (
          <button
            onClick={() => router.push(`/tournament/create?homeGameId=${homeGameId}`)}
            className="bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            + Novo Torneio
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8 text-zinc-600 text-sm">Carregando...</div>
      ) : tournaments.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
          <p>Nenhum torneio ainda</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => (
            <div
              key={t.id}
              onClick={() => router.push(`/tournament/${t.id}`)}
              className="bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl p-4 cursor-pointer flex items-center justify-between transition-colors"
            >
              <div>
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {t._count?.players ?? 0} jogadores • Buy-in R$ {Number(t.buyInAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${statusBadge[t.status] ?? 'text-zinc-400'}`}>
                {statusLabel[t.status] ?? t.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
