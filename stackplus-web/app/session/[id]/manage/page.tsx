'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'
import { joinSession, leaveSession } from '@/services/socket'
import { getSocket } from '@/services/socket'
import { useAuthStore } from '@/store/useStore'

interface Session {
  id: string; status: string; startedAt?: string
  rake?: string | number | null
  caixinha?: string | number | null
  caixinhaPerStaff?: number
  caixinhaDistribution?: Array<{ userId: string; name: string; amount: number; pixType?: string | null; pixKey?: string | null }>
  pokerVariant?: 'HOLDEN' | 'BUTTON_CHOICE' | 'PINEAPPLE' | 'OMAHA' | 'OMAHA_FIVE' | 'OMAHA_SIX'
  gameType?: 'CASH_GAME' | 'TOURNAMENT'
  homeGame: { name: string; chipValue: string; gameType?: 'CASH_GAME' | 'TOURNAMENT'; hostId: string }
  cashier?: { id: string; name: string }
  playerStates: PlayerState[]
  staffAssignments: StaffAssignment[]
  participantAssignments: ParticipantAssignment[]
}

interface StaffAssignment {
  userId: string
  user: { id: string; name: string; email?: string; pixType?: string | null; pixKey?: string | null }
}

interface StaffOption {
  id: string
  name: string
  email?: string | null
  pixType?: string | null
  pixKey?: string | null
}

interface ParticipantAssignment {
  userId: string
  user: { id: string; name: string; email?: string }
}

interface ParticipantOption {
  id: string
  name: string
  email?: string | null
}

const pokerVariantLabels: Record<'HOLDEN' | 'BUTTON_CHOICE' | 'PINEAPPLE' | 'OMAHA' | 'OMAHA_FIVE' | 'OMAHA_SIX', string> = {
  HOLDEN: 'Holden',
  BUTTON_CHOICE: 'Button Choice',
  PINEAPPLE: 'Pineapple',
  OMAHA: 'Omaha',
  OMAHA_FIVE: 'Omaha Five',
  OMAHA_SIX: 'Omaha Six',
}

interface PlayerState {
  userId: string; chipsIn: string; chipsOut: string
  currentStack: string; result: string; hasCashedOut: boolean
  user: { id: string; name: string }
}

interface FinancialReportItem {
  userId: string
  name: string
  amount: number
  mode: 'POSTPAID' | 'PREPAID'
  skippedReason?: string
  charge?: any
  payoutOrder?: any
}

interface FinancialReport {
  sessionId: string
  financialModule: 'POSTPAID' | 'PREPAID' | 'HYBRID'
  generatedAt: string
  summary: {
    chargesCreated: number
    chargesSkipped: number
    payoutsCreatedPendingApproval: number
    payoutsSkipped: number
  }
  charges: FinancialReportItem[]
  payouts: FinancialReportItem[]
}

function extractPixOrderId(payload: any): string | null {
  const candidates = [
    payload?.id,
    payload?.pixId,
    payload?.orderId,
    payload?.order_id,
    payload?.data?.id,
    payload?.data?.pixId,
    payload?.response?.id,
    payload?.response?.pixId,
    payload?.result?.id,
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function extractPixCopyPaste(payload: any): string | null {
  const candidates = [
    payload?.pixCopyPaste,
    payload?.pixCopiaECola,
    payload?.copyPaste,
    payload?.copiaECola,
    payload?.pix?.copiaECola,
    payload?.charge?.pixCopiaECola,
    payload?.data?.pixCopiaECola,
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function extractQrCode(payload: any): string | null {
  const candidates = [
    payload?.qrCodeBase64,
    payload?.qrcode,
    payload?.pixQrCodeBase64,
    payload?.data?.qrcode,
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function extractPayoutPixKey(payload: any): string | null {
  const candidates = [
    payload?.destinatario?.chave,
    payload?.recipient?.key,
    payload?.chave,
    payload?.pixKey,
    payload?.data?.destinatario?.chave,
    payload?.response?.destinatario?.chave,
  ]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export default function SessionManagePage() {
  const router = useRouter()
  const params = useParams()
  const sessionId = params.id as string
  const user = useAuthStore((s) => s.user)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showStaffModal, setShowStaffModal] = useState(false)
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [participantOptions, setParticipantOptions] = useState<ParticipantOption[]>([])
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([])
  const [participantsLoading, setParticipantsLoading] = useState(false)
  const [participantsLoaded, setParticipantsLoaded] = useState(false)
  const [financialReport, setFinancialReport] = useState<FinancialReport | null>(null)
  const [financialLoading, setFinancialLoading] = useState(false)
  const [approvingPixId, setApprovingPixId] = useState<string | null>(null)
  const [approvedPixIds, setApprovedPixIds] = useState<string[]>([])
  const [copiedChargeId, setCopiedChargeId] = useState<string | null>(null)

  function normalizeSession(data: Session): Session {
    const distribution = Array.isArray(data.caixinhaDistribution) ? data.caixinhaDistribution : []
    return {
      ...data,
      playerStates: Array.isArray(data.playerStates) ? data.playerStates : [],
      staffAssignments: Array.isArray(data.staffAssignments) ? data.staffAssignments : [],
      participantAssignments: Array.isArray(data.participantAssignments) ? data.participantAssignments : [],
      caixinhaDistribution: distribution,
      caixinhaPerStaff: typeof data.caixinhaPerStaff === 'number' ? data.caixinhaPerStaff : 0,
    }
  }

  useEffect(() => {
    api.get(`/sessions/${sessionId}`).then(({ data }) => setSession(normalizeSession(data))).finally(() => setLoading(false))

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
      setSession(normalizeSession(data))
    } catch (err) {
      alert(typeof err === 'string' ? err : 'Não foi possível iniciar a sessão')
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
    } catch (err) {
      alert(typeof err === 'string' ? err : 'Não foi possível finalizar a sessão')
    } finally {
      setActionLoading(false)
    }
  }

  async function openStaffModal() {
    setStaffLoading(true)
    try {
      const [{ data: options }, { data: currentSession }] = await Promise.all([
        api.get(`/sessions/${sessionId}/staff`),
        api.get(`/sessions/${sessionId}`),
      ])
      const normalized = normalizeSession(currentSession)
      setSession(normalized)
      setStaffOptions(options)
      setSelectedStaffIds(normalized.staffAssignments.map((assignment) => assignment.userId))
      setShowStaffModal(true)
    } catch (err) {
      alert(typeof err === 'string' ? err : 'Não foi possível carregar o staff')
    } finally {
      setStaffLoading(false)
    }
  }

  async function saveStaff() {
    setStaffLoading(true)
    try {
      const { data } = await api.put(`/sessions/${sessionId}/staff`, { userIds: selectedStaffIds })
      setSession(normalizeSession(data))
      setShowStaffModal(false)
    } catch (err) {
      alert(typeof err === 'string' ? err : 'Não foi possível salvar o staff')
    } finally {
      setStaffLoading(false)
    }
  }

  async function loadParticipantOptions() {
    setParticipantsLoading(true)
    try {
      const [{ data: options }, { data: currentSession }] = await Promise.all([
        api.get(`/sessions/${sessionId}/participants/options`),
        api.get(`/sessions/${sessionId}`),
      ])
      const normalized = normalizeSession(currentSession)
      setSession(normalized)
      setParticipantOptions(options)
      setSelectedParticipantIds(normalized.participantAssignments.map((assignment) => assignment.userId))
    } catch (err) {
      alert(typeof err === 'string' ? err : 'Não foi possível carregar participantes da partida')
    } finally {
      setParticipantsLoading(false)
    }
  }

  async function saveParticipants() {
    setParticipantsLoading(true)
    try {
      const { data } = await api.put(`/sessions/${sessionId}/participants`, { userIds: selectedParticipantIds })
      setSession(normalizeSession(data))
      alert('Participantes da partida atualizados')
    } catch (err) {
      alert(typeof err === 'string' ? err : 'Não foi possível salvar participantes')
    } finally {
      setParticipantsLoading(false)
    }
  }

  async function generateFinancialReport() {
    setFinancialLoading(true)
    try {
      const { data } = await api.post(`/banking/annapay/sessions/${sessionId}/financial-report`, {})
      setFinancialReport(data)
      setApprovedPixIds([])
    } catch (err) {
      alert(typeof err === 'string' ? err : 'Não foi possível gerar o relatório financeiro')
    } finally {
      setFinancialLoading(false)
    }
  }

  async function approvePixOrder(orderId: string) {
    setApprovingPixId(orderId)
    try {
      await api.put(`/banking/annapay/pix/${orderId}`, {})
      setApprovedPixIds((prev) => prev.includes(orderId) ? prev : [...prev, orderId])
    } catch (err) {
      alert(typeof err === 'string' ? err : 'Não foi possível aprovar a ordem PIX')
    } finally {
      setApprovingPixId(null)
    }
  }

  useEffect(() => {
    if (!session || participantsLoaded) return
    const currentGameType = session.gameType || session.homeGame.gameType || 'CASH_GAME'
    const currentIsHost = user?.id === session.homeGame.hostId
    if (!currentIsHost || currentGameType !== 'CASH_GAME') return
    loadParticipantOptions()
    setParticipantsLoaded(true)
  }, [session, participantsLoaded, user?.id])

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-yellow-400 font-black text-2xl">STACKPLUS</div>
  if (!session) return null

  const gameType = session.gameType || session.homeGame.gameType || 'CASH_GAME'
  const pokerVariant = session.pokerVariant || 'HOLDEN'
  const isHost = user?.id === session.homeGame.hostId
  const canStartSession = gameType !== 'CASH_GAME' || session.participantAssignments.length >= 2
  const sessionCaixinha = Number(session.caixinha || 0)
  const hasDistribution = Array.isArray(session.caixinhaDistribution) && session.caixinhaDistribution.length > 0
  const fallbackCaixinhaPerStaff = session.staffAssignments.length > 0
    ? Number((sessionCaixinha / session.staffAssignments.length).toFixed(2))
    : 0
  const staffCaixinhaWinners = hasDistribution
    ? session.caixinhaDistribution || []
    : (session.staffAssignments || []).map((assignment) => ({
      userId: assignment.userId,
      name: assignment.user.name,
      amount: fallbackCaixinhaPerStaff,
      pixType: assignment.user.pixType || null,
      pixKey: assignment.user.pixKey || null,
    }))
  const sortedPlayers = [...(session.playerStates || [])].sort((a, b) => parseFloat(b.result) - parseFloat(a.result))

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-zinc-400 hover:text-white">←</button>
        <div className="flex-1">
          <h1 className="font-bold">{session.homeGame.name}</h1>
          <p className="text-xs text-zinc-400">Gerenciar Sessão • {pokerVariantLabels[pokerVariant]} • {gameType === 'CASH_GAME' ? 'Cash Game' : 'Torneio'}</p>
        </div>
        <div className="flex gap-2">
          {session.status === 'WAITING' && (
            <button onClick={startSession} disabled={actionLoading || !canStartSession}
              className="bg-green-500 hover:bg-green-400 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
              {!canStartSession ? 'Min. 2 participantes' : 'Iniciar'}
            </button>
          )}
          {session.status === 'ACTIVE' && (
            <>
              {gameType === 'CASH_GAME' && (
                <button onClick={() => router.push(`/cashier/${sessionId}`)}
                  className="bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold px-4 py-2 rounded-lg text-sm transition-colors">
                  Caixa
                </button>
              )}
              {isHost && (
                <button onClick={openStaffModal} disabled={staffLoading}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
                  {staffLoading ? 'Carregando...' : `Staff${session.staffAssignments.length ? ` (${session.staffAssignments.length})` : ''}`}
                </button>
              )}
              {gameType === 'TOURNAMENT' && (
                <button onClick={() => window.open(`/tv/${sessionId}`, '_blank')}
                  className="bg-zinc-700 hover:bg-zinc-600 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors">
                  📺 TV
                </button>
              )}
              <button onClick={finishSession} disabled={actionLoading}
                className="bg-red-500 hover:bg-red-400 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
                Finalizar
              </button>
            </>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {gameType === 'CASH_GAME' && isHost && session.status !== 'FINISHED' && (
          <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Participantes da partida</p>
                <p className="mt-1 text-sm text-zinc-300">Escolha quem do home game vai participar desta sessão de cash game.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedParticipantIds(participantOptions.map((person) => person.id))}
                  disabled={participantsLoading || participantOptions.length === 0}
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                >
                  Selecionar todos
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedParticipantIds([])}
                  disabled={participantsLoading}
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  onClick={saveParticipants}
                  disabled={participantsLoading}
                  className="rounded-lg bg-yellow-400 px-3 py-2 text-xs font-bold text-zinc-900 hover:bg-yellow-300 disabled:opacity-50"
                >
                  {participantsLoading ? 'Salvando...' : 'Salvar participantes'}
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {participantOptions.map((person) => {
                const checked = selectedParticipantIds.includes(person.id)
                return (
                  <label key={person.id} className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedParticipantIds((prev) => checked ? prev.filter((id) => id !== person.id) : [...prev, person.id])
                      }}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-medium text-zinc-100">{person.name}</p>
                      {person.email && <p className="text-xs text-zinc-500">{person.email}</p>}
                    </div>
                  </label>
                )
              })}
              {participantOptions.length === 0 && (
                <p className="text-sm text-zinc-500">Nenhuma pessoa cadastrada no home game.</p>
              )}
            </div>
          </div>
        )}

        {session.staffAssignments.length > 0 && (
          <div className="mb-6 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
            <p className="text-xs uppercase tracking-wide text-blue-200">Staff da partida</p>
            <p className="mt-2 text-sm text-zinc-200">{session.staffAssignments.map((assignment) => assignment.user.name).join(', ')}</p>
          </div>
        )}
        {session.status === 'FINISHED' && sessionCaixinha > 0 && (
          <div className="mb-6 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
            <p className="text-xs uppercase tracking-wide text-emerald-200">Divisão da Caixinha</p>
            <p className="mt-1 text-sm text-zinc-200">Total registrado: R$ {sessionCaixinha.toFixed(2)}</p>
            {staffCaixinhaWinners.length > 0 ? (
              <div className="mt-3 space-y-2">
                {staffCaixinhaWinners.map((item) => (
                  <div key={item.userId} className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-zinc-900/60 px-3 py-2 text-sm">
                    <div>
                      <span className="text-zinc-100">{item.name}</span>
                      {item.pixKey && <p className="text-xs text-zinc-400">PIX{item.pixType ? ` (${item.pixType})` : ''}: {item.pixKey}</p>}
                    </div>
                    <span className="font-semibold text-emerald-300">R$ {Number(item.amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-zinc-400">Não há staff selecionado para esta sessão.</p>
            )}
          </div>
        )}
        {session.status === 'FINISHED' && isHost && (
          <div className="mb-6 rounded-xl border border-purple-500/25 bg-purple-500/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-purple-200">Liquidação Financeira (Annapay)</p>
                <p className="mt-1 text-sm text-zinc-300">Gera cobranças PIX para negativos pós-pago e ordens PIX pendentes para positivos.</p>
              </div>
              <button
                type="button"
                onClick={generateFinancialReport}
                disabled={financialLoading}
                className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {financialLoading ? 'Gerando...' : 'Gerar relatório financeiro'}
              </button>
            </div>

            {financialReport && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3">
                    <p className="text-zinc-500">Módulo</p>
                    <p className="mt-1 font-semibold text-zinc-100">{financialReport.financialModule}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3">
                    <p className="text-zinc-500">Cobranças</p>
                    <p className="mt-1 font-semibold text-zinc-100">{financialReport.summary.chargesCreated}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3">
                    <p className="text-zinc-500">Ordens PIX</p>
                    <p className="mt-1 font-semibold text-zinc-100">{financialReport.summary.payoutsCreatedPendingApproval}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3">
                    <p className="text-zinc-500">Gerado em</p>
                    <p className="mt-1 font-semibold text-zinc-100">{new Date(financialReport.generatedAt).toLocaleString('pt-BR')}</p>
                  </div>
                </div>

                {/* Jogadores que devem pagar (negativos) */}
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-red-400">🔴 Devem pagar ao host</p>
                  {financialReport.financialModule === 'PREPAID' ? (
                    <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3 text-sm text-zinc-400">
                      Home game pré-pago — todos os valores foram cobrados antecipadamente na entrada. Nenhuma cobrança adicional é gerada no fechamento.
                    </div>
                  ) : financialReport.charges.length === 0 ? (
                    <p className="text-sm text-zinc-500">Nenhuma cobrança gerada.</p>
                  ) : (
                    financialReport.charges.map((item) => {
                      const pixCopyPaste = extractPixCopyPaste(item.charge)
                      const qrCode = extractQrCode(item.charge)
                      const isCopied = copiedChargeId === item.userId
                      return (
                        <div key={`charge-${item.userId}`} className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold text-zinc-100">{item.name}</p>
                              <p className="text-lg font-black text-red-400">-{Number(item.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                            </div>
                            {qrCode && (
                              <img src={qrCode} alt="QR Code PIX" className="w-24 h-24 rounded border border-zinc-700" />
                            )}
                          </div>
                          {item.skippedReason ? (
                            <p className="mt-2 text-xs text-red-300">⚠ {item.skippedReason}</p>
                          ) : pixCopyPaste ? (
                            <div className="mt-3">
                              <p className="mb-1 text-xs text-zinc-400">PIX Copia e Cola · válido por 24h</p>
                              <div className="flex gap-2">
                                <input readOnly value={pixCopyPaste} className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300 font-mono" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(pixCopyPaste)
                                    setCopiedChargeId(item.userId)
                                    setTimeout(() => setCopiedChargeId(null), 2000)
                                  }}
                                  className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700 whitespace-nowrap"
                                >
                                  {isCopied ? '✓ Copiado' : 'Copiar'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-green-300">Cobrança PIX gerada (sem copia e cola disponível).</p>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Jogadores que devem receber (positivos) */}
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-green-400">
                    🟢 {financialReport.financialModule === 'PREPAID' ? 'Devolvem cashout (pré-pago)' : 'Devem receber do host'}
                  </p>
                  {financialReport.financialModule === 'PREPAID' && (
                    <p className="text-xs text-zinc-500">Valor total do cashout de cada jogador — inclui buy-in devolvido + lucro.</p>
                  )}
                  {financialReport.payouts.length === 0 ? (
                    <p className="text-sm text-zinc-500">Nenhuma ordem de pagamento gerada.</p>
                  ) : (
                    financialReport.payouts.map((item) => {
                      const orderId = extractPixOrderId(item.payoutOrder)
                      const pixKey = extractPayoutPixKey(item.payoutOrder)
                      const isApproved = orderId ? approvedPixIds.includes(orderId) : false
                      return (
                        <div key={`payout-${item.userId}`} className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-bold text-zinc-100">{item.name}</p>
                              <p className="text-lg font-black text-green-400">+{Number(item.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                              {pixKey && <p className="mt-1 text-xs text-zinc-400">Chave PIX: <span className="text-zinc-200 font-mono">{pixKey}</span></p>}
                            </div>
                            {!item.skippedReason && (
                              <div className="text-right">
                                {isApproved ? (
                                  <div className="rounded-lg bg-green-900/50 border border-green-500/30 px-3 py-2 text-xs font-bold text-green-300">
                                    ✓ PIX enviado
                                  </div>
                                ) : orderId ? (
                                  <button
                                    type="button"
                                    onClick={() => approvePixOrder(orderId)}
                                    disabled={approvingPixId === orderId}
                                    className="rounded-lg bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-500 disabled:opacity-50"
                                  >
                                    {approvingPixId === orderId ? 'Enviando...' : 'Enviar PIX'}
                                  </button>
                                ) : (
                                  <p className="text-xs text-zinc-500">Aguardando confirmação</p>
                                )}
                              </div>
                            )}
                          </div>
                          {item.skippedReason && (
                            <p className="mt-2 text-xs text-red-300">⚠ {item.skippedReason}</p>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {gameType === 'TOURNAMENT' && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            A modalidade torneio ja esta separada no sistema, mas o fluxo operacional especifico de torneio ainda nao foi implementado. Por isso, o caixa de cash game fica desativado aqui.
          </div>
        )}
        <div className="space-y-3">
          <h2 className="text-lg font-bold">Ranking em Tempo Real</h2>
          {sortedPlayers.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
              {gameType === 'CASH_GAME' ? 'Aguardando buy-ins...' : 'Aguardando jogadores...'}
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

      {showStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-6">
            <h3 className="text-lg font-bold">Staff da Partida</h3>
            <p className="mt-1 text-sm text-zinc-400">Selecione quem participa da divisão da caixinha desta partida.</p>

            <div className="mt-5 max-h-80 space-y-2 overflow-y-auto pr-1">
              {staffOptions.map((person) => {
                const checked = selectedStaffIds.includes(person.id)
                return (
                  <label key={person.id} className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedStaffIds((prev) => checked ? prev.filter((id) => id !== person.id) : [...prev, person.id])
                      }}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-medium text-zinc-100">{person.name}</p>
                      {person.email && <p className="text-xs text-zinc-500">{person.email}</p>}
                    </div>
                  </label>
                )
              })}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowStaffModal(false)}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveStaff}
                disabled={staffLoading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {staffLoading ? 'Salvando...' : 'Salvar Staff'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
