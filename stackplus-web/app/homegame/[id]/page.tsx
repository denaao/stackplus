'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'
import AppHeader from '@/components/AppHeader'
import AppLoading from '@/components/AppLoading'
import HomeGameTabs from '@/components/HomeGameTabs'

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
  members: { id: string; paymentMode?: 'POSTPAID' | 'PREPAID' | null; role?: 'PLAYER' | 'HOST'; user: { id: string; name: string; email?: string } }[]
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
  const { user, logout } = useAuthStore()
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

  if (loading) return <AppLoading />
  if (!game) return null
  const isHost = user?.id === game.host.id
  const selectedSangeurAccess = sangeurAccesses.find((item) => item.userId === sangeurUserId)

  const statusColors: Record<string, string> = {
    WAITING: 'text-sx-cyan bg-sx-cyan/10',
    ACTIVE: 'text-sx-cyan bg-sx-cyan/10',
    FINISHED: 'text-sx-muted bg-white/5',
  }
  const statusLabel: Record<string, string> = { WAITING: 'Aguardando', ACTIVE: 'Ativa', FINISHED: 'Finalizada' }

  function handleLogout() { logout(); router.push('/') }

  return (
    <div className="min-h-screen bg-sx-bg">
      <AppHeader
        title={game.name}
        onBack={() => router.push(`/homegame/${id}/select`)}
        userName={user?.name}
        onLogout={handleLogout}
        rightSlot={
          <span
            className="text-xs font-mono font-bold px-2 py-1 rounded"
            style={{ background: 'rgba(0,200,224,0.1)', color: '#00C8E0', border: '1px solid rgba(0,200,224,0.2)' }}
          >
            {game.joinCode}
          </span>
        }
      />
      <HomeGameTabs homeGameId={id} active="CASH" />

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {pageFeedback && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${pageFeedback.tone === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-sx-cyan/30 bg-sx-cyan/10 text-sx-cyan'}`}>
            {pageFeedback.message}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold">Sessões de Cash Game</h2>
              <p className="mt-1 text-xs text-sx-muted">
                Cada partida começa com as perguntas de configuração (financeiro, sangeur, jackpot).
              </p>
            </div>
            <button
              onClick={openCreatePicker}
              disabled={creating || !isHost}
              className="btn-sx-primary px-5 py-2 rounded-xl text-sm font-black text-sx-bg disabled:opacity-50">
              {creating ? 'Criando...' : '+ Nova Partida'}
            </button>
          </div>

          {sessions.length === 0 ? (
            <div className="text-center py-12 text-sx-muted border border-dashed border-sx-border rounded-xl">
              <p>Nenhuma sessão ainda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => router.push(`/session/${s.id}/manage`)}
                  className="relative rounded-xl overflow-hidden cursor-pointer group transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)',
                    border: '1px solid rgba(0,200,224,0.12)',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(0,200,224,0.3)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(0,200,224,0.12)' }}
                >
                  {/* Status color bar */}
                  <div className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{ background: s.status === 'ACTIVE' ? '#00C8E0' : s.status === 'WAITING' ? '#00C8E0' : 'rgba(255,255,255,0.15)' }} />

                  <div className="pl-4 pr-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-white">
                        {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                      <p className="text-xs text-sx-muted mt-0.5">
                        {pokerVariantOptions.find((o) => o.value === (s.pokerVariant || 'HOLDEN'))?.label || 'Holden'}
                        {' · '}{s._count.playerStates} jogadores
                        {' · '}{s._count.transactions} transações
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusColors[s.status]}`}>
                        {statusLabel[s.status]}
                      </span>
                      {s.status === 'FINISHED' && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); router.push(`/session/${s.id}/report`) }}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors"
                          style={{ background: 'rgba(0,200,224,0.08)', border: '1px solid rgba(0,200,224,0.25)', color: '#00C8E0' }}
                        >
                          📊 Relatório
                        </button>
                      )}
                      {isHost && s.status !== 'FINISHED' && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); cancelSession(s.id) }}
                          disabled={deletingSessionId === s.id}
                          className="bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 text-red-300 text-xs font-bold px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {deletingSessionId === s.id ? 'Cancelando...' : 'Cancelar'}
                        </button>
                      )}
                      <span className="text-sx-muted group-hover:text-sx-cyan transition-colors text-sm">→</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>


      </main>

      {showCreatePicker && isHost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-6"
            style={{ background: 'linear-gradient(160deg, #0C2238 0%, #071828 100%)', border: '1px solid rgba(0,200,224,0.2)', boxShadow: '0 8px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,200,224,0.05)' }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-black text-white">Nova Partida</h3>
              <span className="text-[11px] font-bold text-sx-muted uppercase tracking-widest px-2 py-1 rounded-full" style={{ background: 'rgba(0,200,224,0.08)', border: '1px solid rgba(0,200,224,0.15)' }}>
                Passo {wizardStep} de 2
              </span>
            </div>
            <p className="text-sm text-sx-muted mb-1">
              {wizardStep === 1 ? 'Configure financeiro, sangeur e jackpot.' : 'Parâmetros do Cash Game.'}
            </p>

            {createFormError && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {createFormError}
              </div>
            )}

            {wizardStep === 1 && (
              <>
                <div className="mt-5 rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,224,0.1)' }}>
                  <p className="text-[11px] font-black uppercase tracking-widest text-sx-cyan mb-0.5">1. Módulo Financeiro</p>
                  <p className="text-xs text-sx-muted mb-3">Pós-pago, pré-pago ou híbrido?</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'POSTPAID', label: 'Pós-pago' },
                      { key: 'PREPAID', label: 'Pré-pago' },
                      { key: 'HYBRID', label: 'Híbrido' },
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setNewSessionFinancialModule(option.key as 'POSTPAID' | 'PREPAID' | 'HYBRID')}
                        className={`rounded-xl py-2.5 text-sm font-bold transition-all ${
                          newSessionFinancialModule === option.key
                            ? 'btn-sx-primary text-sx-bg'
                            : 'text-sx-muted hover:text-white'
                        }`}
                        style={newSessionFinancialModule !== option.key ? { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' } : {}}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3 rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,224,0.1)' }}>
                  <p className="text-[11px] font-black uppercase tracking-widest text-sx-cyan mb-0.5">2. Sangeur</p>
                  <p className="text-xs text-sx-muted mb-3">Esta partida tem SANGEUR (caixa móvel)?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSessionHasSangeur(true)}
                      className={`rounded-xl py-2.5 text-sm font-bold transition-all ${
                        sessionHasSangeur ? 'btn-sx-primary text-sx-bg' : 'text-sx-muted hover:text-white'
                      }`}
                      style={!sessionHasSangeur ? { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' } : {}}
                    >
                      Sim
                    </button>
                    <button
                      type="button"
                      onClick={() => setSessionHasSangeur(false)}
                      className={`rounded-xl py-2.5 text-sm font-bold transition-all ${
                        !sessionHasSangeur ? 'btn-sx-primary text-sx-bg' : 'text-sx-muted hover:text-white'
                      }`}
                      style={sessionHasSangeur ? { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' } : {}}
                    >
                      Não
                    </button>
                  </div>

                  {sessionHasSangeur && (
                    <div className="mt-4 space-y-3 rounded-lg border border-sx-border2 bg-sx-card/70 p-3">
                      <div className="space-y-1">
                        <label className="text-xs uppercase tracking-wide text-sx-muted">Participante SANGEUR</label>
                        <select
                          value={sangeurUserId}
                          onChange={(e) => setSangeurUserId(e.target.value)}
                          className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none"
                        >
                          <option value="">Selecione um membro…</option>
                          {game.members.map((m) => (
                            <option key={m.id} value={m.user.id}>{m.user.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs uppercase tracking-wide text-sx-muted">Usuário POS</label>
                          <input
                            type="text"
                            value={sangeurUsername}
                            onChange={(e) => setSangeurUsername(e.target.value)}
                            className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs uppercase tracking-wide text-sx-muted">Senha (opcional)</label>
                          <input
                            type="text"
                            value={sangeurPassword}
                            onChange={(e) => setSangeurPassword(e.target.value)}
                            placeholder="Gerada se vazio"
                            className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none"
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
                        className="w-full rounded-lg border border-sx-cyan/40 bg-sx-cyan/10 px-3 py-2 text-sm font-bold text-sx-cyan hover:bg-sx-cyan/20 disabled:opacity-50"
                      >
                        {sangeurLoading
                          ? 'Salvando…'
                          : selectedSangeurAccess
                          ? 'Atualizar acesso'
                          : 'Habilitar SANGEUR'}
                      </button>

                      {issuedCredential && (
                        <div className="rounded-lg border border-sx-cyan/30 bg-sx-cyan/10 px-3 py-2 text-xs text-sx-cyan">
                          {issuedCredential.userName}: <span className="font-mono">{issuedCredential.username}</span> / <span className="font-mono">{issuedCredential.temporaryPassword}</span>
                        </div>
                      )}

                      {sangeurAccesses.length > 0 && (
                        <div className="space-y-2 border-t border-sx-border pt-3">
                          <p className="text-[11px] uppercase tracking-wide text-sx-muted">Acessos cadastrados</p>
                          {sangeurAccesses.map((access) => (
                            <div key={access.id} className="flex items-center justify-between gap-2 rounded-lg border border-sx-border bg-sx-card px-3 py-2 text-xs">
                              <div>
                                <p className="font-bold text-zinc-200">{access.user.name}</p>
                                <p className="text-sx-muted font-mono">{access.username}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${access.isActive ? 'bg-sx-cyan/15 text-sx-cyan' : 'bg-sx-border2 text-sx-muted'}`}>
                                  {access.isActive ? 'Ativo' : 'Inativo'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleResetSangeurPassword(access.userId)}
                                  disabled={sangeurActionUserId === access.userId}
                                  className="rounded border border-sx-border2 px-2 py-0.5 text-[10px] font-bold text-zinc-300 hover:bg-sx-input disabled:opacity-50"
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

                <div className="mt-3 rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,200,224,0.1)' }}>
                  <p className="text-[11px] font-black uppercase tracking-widest text-sx-cyan mb-0.5">3. Jackpot</p>
                  <p className="text-xs text-sx-muted mb-3">Esta partida tem JACKPOT?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewSessionJackpotEnabled(true)}
                      className={`rounded-xl py-2.5 text-sm font-bold transition-all ${
                        newSessionJackpotEnabled ? 'btn-sx-primary text-sx-bg' : 'text-sx-muted hover:text-white'
                      }`}
                      style={!newSessionJackpotEnabled ? { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' } : {}}
                    >
                      Sim
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewSessionJackpotEnabled(false)}
                      className={`rounded-xl py-2.5 text-sm font-bold transition-all ${
                        !newSessionJackpotEnabled ? 'btn-sx-primary text-sx-bg' : 'text-sx-muted hover:text-white'
                      }`}
                      style={newSessionJackpotEnabled ? { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' } : {}}
                    >
                      Não
                    </button>
                  </div>

                  {newSessionJackpotEnabled && (
                    <div className="mt-3 space-y-1">
                      <label className="text-xs uppercase tracking-wide text-sx-muted">JACKPOT acumulado (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={jackpotAccumulated}
                        onChange={(e) => setJackpotAccumulated(e.target.value)}
                        className="w-full rounded-lg border border-sx-border2 bg-sx-card px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {wizardStep === 2 && (
              <div className="mt-4 grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-sx-muted uppercase tracking-wide">Modalidade</label>
                  <select
                    value={pokerVariant}
                    onChange={(e) => setPokerVariant(e.target.value as 'HOLDEN' | 'BUTTON_CHOICE' | 'PINEAPPLE' | 'OMAHA' | 'OMAHA_FIVE' | 'OMAHA_SIX')}
                    className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none"
                  >
                    {pokerVariantOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-sx-muted uppercase tracking-wide">Valor da ficha (R$)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={cashChipValue}
                    onChange={(e) => setCashChipValue(e.target.value)}
                    className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-sx-muted uppercase tracking-wide">Small blind (R$)</label>
                    <input type="number" min="0" step="0.01" value={cashSmallBlind} onChange={(e) => setCashSmallBlind(e.target.value)} className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-sx-muted uppercase tracking-wide">Big blind (R$)</label>
                    <input type="number" min="0.01" step="0.01" value={cashBigBlind} onChange={(e) => setCashBigBlind(e.target.value)} className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-sx-muted uppercase tracking-wide">Mínimo entrada (R$)</label>
                    <input type="number" min="0" step="0.01" value={cashMinimumBuyIn} onChange={(e) => setCashMinimumBuyIn(e.target.value)} className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-sx-muted uppercase tracking-wide">Min. permanência (min)</label>
                    <input type="number" min="0" step="1" value={cashMinimumStayMinutes} onChange={(e) => setCashMinimumStayMinutes(e.target.value)} className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-sx-muted uppercase tracking-wide">Taxa alimentação (R$)</label>
                    <input type="number" min="0" step="0.01" value={cashFoodFee} onChange={(e) => setCashFoodFee(e.target.value)} className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none" />
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2 pt-2" style={{ borderTop: '1px solid rgba(0,200,224,0.1)' }}>
              <button
                type="button"
                onClick={() => {
                  if (wizardStep === 2) { setWizardStep(1); setCreateFormError(null) }
                  else { setShowCreatePicker(false); setCreateFormError(null) }
                }}
                className="rounded-xl px-5 py-2.5 text-sm font-bold text-sx-muted hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
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
                  className="btn-sx-primary rounded-xl px-5 py-2.5 text-sm font-black text-sx-bg"
                >
                  Próximo →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={createSession}
                  disabled={creating}
                  className="btn-sx-primary rounded-xl px-5 py-2.5 text-sm font-black text-sx-bg disabled:opacity-50"
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
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-sx-card p-6">
            <h3 className="text-lg font-bold text-white">Cancelar partida</h3>
            <p className="mt-2 text-sm text-zinc-300">
              Esta acao vai remover a partida e todos os dados vinculados. Nao podera ser desfeita.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmCancelSessionId(null)}
                disabled={deletingSessionId === confirmCancelSessionId}
                className="rounded-lg border border-sx-border2 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-sx-input disabled:opacity-50"
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
    RUNNING: 'text-sx-cyan bg-sx-cyan/10',
    ON_BREAK: 'text-sx-cyan bg-sx-cyan/10',
    FINISHED: 'text-sx-muted bg-white/5',
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
          <p className="mt-1 text-xs text-sx-muted">Crie e gerencie torneios com comanda por jogador.</p>
        </div>
        {isHost && (
          <button
            onClick={() => router.push(`/tournament/create?homeGameId=${homeGameId}`)}
            className="btn-sx-primary px-5 py-2 rounded-xl text-sm font-black text-sx-bg"
          >
            + Novo Torneio
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8 text-sx-muted text-sm">Carregando...</div>
      ) : tournaments.length === 0 ? (
        <div className="text-center py-12 text-sx-muted border border-dashed border-sx-border rounded-xl">
          <p>Nenhum torneio ainda</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => {
            const isActive = t.status === 'RUNNING' || t.status === 'REGISTRATION' || t.status === 'ON_BREAK'
            const barColor = t.status === 'RUNNING' ? '#00C8E0'
              : t.status === 'REGISTRATION' ? '#60a5fa'
              : t.status === 'ON_BREAK' ? '#00C8E0'
              : 'rgba(255,255,255,0.15)'
            return (
              <div
                key={t.id}
                onClick={() => router.push(`/tournament/${t.id}`)}
                className="relative rounded-xl overflow-hidden cursor-pointer group transition-all"
                style={{
                  background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)',
                  border: '1px solid rgba(0,200,224,0.12)',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(0,200,224,0.3)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(0,200,224,0.12)' }}
              >
                <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: barColor }} />
                <div className="pl-4 pr-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-white">{t.name}</p>
                    <p className="text-xs text-sx-muted mt-0.5">
                      {t._count?.players ?? 0} jogadores • Buy-in R$ {Number(t.buyInAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusBadge[t.status] ?? 'text-sx-muted bg-white/5'}`}>
                      {statusLabel[t.status] ?? t.status}
                    </span>
                    <span className="text-sx-muted group-hover:text-sx-cyan transition-colors text-sm">→</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
