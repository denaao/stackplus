'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'
import { joinSession, leaveSession, getSocket } from '@/services/socket'

interface Member { id: string; name: string; paymentMode?: 'POSTPAID' | 'PREPAID' | null }
interface PlayerState {
  userId: string; chipsIn: string; chipsOut: string
  currentStack: string; result: string; hasCashedOut: boolean
  user: { id: string; name: string }
}

interface CashierTransaction {
  id: string
  userId: string
  type: 'BUYIN' | 'REBUY' | 'ADDON' | 'CASHOUT'
  amount: string | number
  chips: string | number
  note?: string | null
  createdAt: string
}

interface StaffAssignment {
  userId: string
  user: { id: string; name: string; email?: string }
}

interface PrepaidChargeResult {
  playerMode: 'POSTPAID' | 'PREPAID'
  requiresCharge: boolean
  amount: number
  charge?: any
}

interface PendingPrepaidTransaction {
  sessionId: string
  userId: string
  type: 'BUYIN' | 'REBUY' | 'ADDON'
  amount: number
  chips: number
  note?: string
}

interface CashierRegisterResponse {
  transaction: CashierTransaction
  playerState: PlayerState
}

const transactionTypeLabel: Record<CashierTransaction['type'], string> = {
  BUYIN: 'Buy-in',
  REBUY: 'Rebuy',
  ADDON: 'Addon',
  CASHOUT: 'Cashout',
}

function formatCurrency(value: string | number) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatChips(value: string | number) {
  return Number(value).toLocaleString('pt-BR')
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function extractPixCopyPaste(payload: any): string | null {
  const candidates = [
    payload?.pixCopiaECola,
    payload?.pixCopyPaste,
    payload?.copyPaste,
    payload?.copiaECola,
    payload?.links?.emv,
    payload?.pix?.copiaECola,
    payload?.pix?.copyPaste,
    payload?.charge?.pixCopiaECola,
    payload?.charge?.links?.emv,
    payload?.charge?.pix?.copiaECola,
    payload?.data?.pixCopiaECola,
  ]

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return null
}

function extractPixQrImage(payload: any): string | null {
  const candidates = [
    payload?.qrCodeBase64,
    payload?.pixQrCodeBase64,
    payload?.qrcode,
    payload?.links?.qrCode,
    payload?.pix?.qrcode,
    payload?.charge?.qrcode,
    payload?.charge?.qrCodeBase64,
    payload?.charge?.links?.qrCode,
    payload?.data?.qrcode,
  ]

  for (const value of candidates) {
    if (typeof value !== 'string' || !value.trim()) continue
    if (value.startsWith('data:image')) return value
    return `data:image/png;base64,${value}`
  }

  return null
}

function extractCobStatus(payload: any): string | null {
  const candidates = [
    payload?.status,
    payload?.data?.status,
    payload?.response?.status,
    payload?.cob?.status,
    payload?.pix?.status,
  ]

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return null
}

function isPaidCobStatus(status: string | null): boolean {
  if (!status) return false
  const normalized = status.toLowerCase()
  return [
    'concluida',
    'concluído',
    'concluido',
    'liquidada',
    'liquidado',
    'paga',
    'pago',
    'recebida',
    'recebido',
    'paid',
  ].some((token) => normalized.includes(token))
}

function resolvePlayerPaymentMode(financialModule: string | undefined, memberMode: 'POSTPAID' | 'PREPAID' | null | undefined) {
  const moduleNormalized = String(financialModule || 'POSTPAID').toUpperCase()
  if (moduleNormalized === 'PREPAID') return 'PREPAID'
  if (moduleNormalized === 'POSTPAID') return 'POSTPAID'
  return memberMode === 'PREPAID' ? 'PREPAID' : 'POSTPAID'
}

export default function CashierPage() {
  const router = useRouter()
  const params = useParams()
  const sessionId = params.sessionId as string
  const [session, setSession] = useState<any>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [playerStates, setPlayerStates] = useState<PlayerState[]>([])
  const [transactions, setTransactions] = useState<CashierTransaction[]>([])
  const [form, setForm] = useState({ userId: '', amount: '', chips: '', note: '' })
  const [transactionType, setTransactionType] = useState<'BUYIN' | 'REBUY' | 'CASHOUT'>('BUYIN')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showEndModal, setShowEndModal] = useState(false)
  const [endForm, setEndForm] = useState({ rake: '', caixinha: '' })
  const [showPrepaidModal, setShowPrepaidModal] = useState(false)
  const [prepaidChargeResult, setPrepaidChargeResult] = useState<PrepaidChargeResult | null>(null)
  const [pendingPrepaidTransaction, setPendingPrepaidTransaction] = useState<PendingPrepaidTransaction | null>(null)
  const [registeringPendingPrepaid, setRegisteringPendingPrepaid] = useState(false)
  const [checkingChargeStatus, setCheckingChargeStatus] = useState(false)
  const [chargeStatusMessage, setChargeStatusMessage] = useState('')
  const [autoProcessingPaidCharge, setAutoProcessingPaidCharge] = useState(false)

  async function refreshCashierSnapshot() {
    const [sessionResponse, transactionsResponse] = await Promise.all([
      api.get(`/sessions/${sessionId}`),
      api.get('/cashier/transactions', { params: { sessionId } }),
    ])

    setSession(sessionResponse.data)
    setPlayerStates(sessionResponse.data.playerStates || [])
    setTransactions(transactionsResponse.data || [])
  }

  useEffect(() => {
    api.get(`/sessions/${sessionId}`).then(async ({ data }) => {
      setSession(data)
      setPlayerStates(data.playerStates)
      const [membersResponse, transactionsResponse] = await Promise.all([
        api.get(`/groups/${data.homeGameId}/members`),
        api.get('/cashier/transactions', { params: { sessionId } }),
      ])
      const allMembers: Member[] = membersResponse.data.map((m: any) => ({
        id: m.user.id,
        name: m.user.name,
        paymentMode: m.paymentMode || null,
      }))
      const participantIds: string[] = Array.isArray(data.participantAssignments)
        ? data.participantAssignments.map((assignment: any) => assignment.userId)
        : []
      const filteredMembers = participantIds.length > 0
        ? allMembers.filter((member) => participantIds.includes(member.id))
        : allMembers
      setMembers(filteredMembers)
      setTransactions(transactionsResponse.data)
    })

    joinSession(sessionId)
    const socket = getSocket()
    socket.on('transaction:new', ({ transaction, playerState }: { transaction: CashierTransaction; playerState: PlayerState }) => {
      setPlayerStates((prev) => {
        const exists = prev.find((p) => p.userId === playerState.userId)
        return exists ? prev.map((p) => p.userId === playerState.userId ? playerState : p) : [...prev, playerState]
      })
      setTransactions((prev) => {
        if (prev.some((item) => item.id === transaction.id)) return prev
        return [transaction, ...prev]
      })
    })
    socket.on('ranking:updated', (ranking: PlayerState[]) => setPlayerStates(ranking))

    return () => { leaveSession(sessionId); socket.off('transaction:new'); socket.off('ranking:updated') }
  }, [sessionId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!form.userId) { setError('Selecione um jogador'); return }
    if (form.chips.trim() === '') {
      setError('Informe uma quantidade de fichas')
      return
    }
    const parsedChips = parseFloat(form.chips) || 0
    if (transactionType !== 'CASHOUT' && parsedChips <= 0) {
      setError('Informe uma quantidade de fichas maior que zero')
      return
    }
    if (transactionType === 'CASHOUT' && parsedChips < 0) {
      setError('Cashout não pode ter quantidade negativa')
      return
    }
    if (transactionType === 'CASHOUT') {
      if (parsedChips > totalChipsInPlay) {
        setError(`Cashout n\u00e3o pode exceder o total de fichas em jogo (${totalChipsInPlay.toLocaleString()} fichas)`)
        setLoading(false)
        return
      }
    }
    setLoading(true)
    try {
      const amount = Number((parsedChips * chipValue).toFixed(2))
      const selectedMember = members.find((member) => member.id === form.userId)
      const playerMode = resolvePlayerPaymentMode(session?.homeGame?.financialModule, selectedMember?.paymentMode)

      if (transactionType !== 'CASHOUT' && playerMode === 'PREPAID') {
        const purchaseType = transactionType as 'BUYIN' | 'REBUY' | 'ADDON'
        const { data } = await api.post('/banking/annapay/prepaid/purchase-charge', {
          sessionId,
          userId: form.userId,
          type: purchaseType,
          chips: parsedChips,
        })

        setPrepaidChargeResult(data)
        setPendingPrepaidTransaction({
          sessionId,
          userId: form.userId,
          type: purchaseType,
          amount,
          chips: parsedChips,
          note: form.note || undefined,
        })
        setChargeStatusMessage('')
        setShowPrepaidModal(true)
        setSuccess('Cobrança pré-paga gerada. Após receber o pagamento, confirme o registro da compra.')
        return
      }

      const { data } = await api.post('/cashier/transaction', {
        sessionId,
        userId: form.userId,
        type: transactionType,
        amount,
        chips: parsedChips,
        note: form.note || undefined,
      })
      applyRegisterResult(data as CashierRegisterResponse)
      await refreshCashierSnapshot()
      setSuccess('Transação registrada!')
      setForm({ userId: '', amount: '', chips: '', note: '' })
      setTransactionType('BUYIN')
      setTimeout(() => setSuccess(''), 2000)
    } catch (err: any) {
      setError(typeof err === 'string' ? err : 'Erro ao registrar')
    } finally {
      setLoading(false)
    }
  }

  function applyRegisterResult(result: CashierRegisterResponse) {
    if (!result?.transaction || !result?.playerState) return

    setPlayerStates((prev) => {
      const exists = prev.find((p) => p.userId === result.playerState.userId)
      return exists
        ? prev.map((p) => p.userId === result.playerState.userId ? result.playerState : p)
        : [...prev, result.playerState]
    })

    setTransactions((prev) => {
      if (prev.some((item) => item.id === result.transaction.id)) return prev
      return [result.transaction, ...prev]
    })
  }

  async function registerPendingPrepaidTransaction(options?: { closeModalOnStart?: boolean; automatic?: boolean }) {
    if (!pendingPrepaidTransaction) return

    const closeOnStart = options?.closeModalOnStart ?? true
    if (closeOnStart) setShowPrepaidModal(false)

    setRegisteringPendingPrepaid(true)
    try {
      const { data } = await api.post('/cashier/transaction', {
        sessionId: pendingPrepaidTransaction.sessionId,
        userId: pendingPrepaidTransaction.userId,
        type: pendingPrepaidTransaction.type,
        amount: pendingPrepaidTransaction.amount,
        chips: pendingPrepaidTransaction.chips,
        note: pendingPrepaidTransaction.note,
      })
      applyRegisterResult(data as CashierRegisterResponse)
      await refreshCashierSnapshot()

      setSuccess('Compra registrada com sucesso após confirmação do pagamento.')
      setForm({ userId: '', amount: '', chips: '', note: '' })
      setTransactionType('BUYIN')
      setShowPrepaidModal(false)
      setPendingPrepaidTransaction(null)
      setPrepaidChargeResult(null)
      setTimeout(() => setSuccess(''), 2500)
    } catch (err: any) {
      if (closeOnStart) {
        setShowPrepaidModal(true)
      }
      if (options?.automatic) {
        setShowPrepaidModal(true)
      }
      setError(typeof err === 'string' ? err : 'Erro ao registrar compra pré-paga')
    } finally {
      setRegisteringPendingPrepaid(false)
      if (options?.automatic) {
        setAutoProcessingPaidCharge(false)
      }
    }
  }

  async function verifyPrepaidChargeStatus() {
    const chargeId = prepaidChargeResult?.charge?.id
    if (!chargeId) {
      setChargeStatusMessage('Cobrança sem identificador para consulta de status.')
      return
    }

    setCheckingChargeStatus(true)
    try {
      const { data } = await api.get(`/banking/annapay/cob/${chargeId}`)
      const status = extractCobStatus(data)
      if (isPaidCobStatus(status)) {
        setChargeStatusMessage(`Pagamento identificado na Annapay (status: ${status}).`)
        return
      }

      setChargeStatusMessage(`Pagamento ainda não identificado (status atual: ${status || 'desconhecido'}).`)
    } catch (err: any) {
      setChargeStatusMessage(typeof err === 'string' ? err : 'Falha ao consultar status da cobrança.')
    } finally {
      setCheckingChargeStatus(false)
    }
  }

  useEffect(() => {
    if (!showPrepaidModal || !prepaidChargeResult?.charge?.id) return

    let stopped = false
    const run = async () => {
      if (stopped || autoProcessingPaidCharge || registeringPendingPrepaid) return

      const chargeId = prepaidChargeResult.charge.id
      try {
        const { data } = await api.get(`/banking/annapay/cob/${chargeId}`)
        const status = extractCobStatus(data)
        if (isPaidCobStatus(status)) {
          setChargeStatusMessage(`Pagamento identificado na Annapay (status: ${status}).`)
          stopped = true
          setAutoProcessingPaidCharge(true)
          await registerPendingPrepaidTransaction({ closeModalOnStart: true, automatic: true })
          return
        }

        setChargeStatusMessage(`Aguardando pagamento... status atual: ${status || 'desconhecido'}.`)
      } catch {
        // Keep polling; intermittent failures should not break the cashier flow.
      }
    }

    run()
    const timer = setInterval(run, 5000)

    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [showPrepaidModal, prepaidChargeResult?.charge?.id, autoProcessingPaidCharge, registeringPendingPrepaid])

  const chipValue = session ? parseFloat(session.chipValue || session.homeGame.chipValue) : 1
  const selectedPlayerState = playerStates.find((p) => p.userId === form.userId)
  const hasExistingBuyIn = Boolean(selectedPlayerState)
  const totalChipsInPlay = playerStates.reduce((sum, p) => {
    const chipsIn = Number(p.chipsIn)
    const chipsOut = Number(p.chipsOut)
    return sum + (chipsIn - chipsOut)
  }, 0) / chipValue
  const currentType = transactionType

  const allPlayersHaveCashedOut = playerStates.length > 0 && playerStates.every((p) => p.hasCashedOut)
  const pendingChips = playerStates.reduce((sum, p) => {
    const chipsIn = Number(p.chipsIn)
    const chipsOut = Number(p.chipsOut)
    return sum + (chipsIn - chipsOut)
  }, 0) / chipValue
  const staffAssignments: StaffAssignment[] = Array.isArray(session?.staffAssignments) ? session.staffAssignments : []
  const parsedCaixinha = parseFloat(endForm.caixinha || '0') || 0
  const hasInvalidCaixinhaSplit = parsedCaixinha > 0 && staffAssignments.length > 0
    ? Math.round(parsedCaixinha * 100) % staffAssignments.length !== 0
    : false
  const caixinhaPerStaff = staffAssignments.length > 0
    ? Number((parsedCaixinha / staffAssignments.length).toFixed(2))
    : 0
  const caixinhaDistributionPreview = !hasInvalidCaixinhaSplit && parsedCaixinha > 0 && staffAssignments.length > 0
    ? staffAssignments.map((assignment) => ({
      userId: assignment.userId,
      name: assignment.user.name,
      amount: caixinhaPerStaff,
    }))
    : []

  async function handleEndSession(e: React.FormEvent) {
    e.preventDefault()
    if (!endForm.rake || !endForm.caixinha) {
      setError('Preencha Rake e Caixinha')
      return
    }
    if (parsedCaixinha > 0 && staffAssignments.length === 0) {
      setError('Selecione o staff da partida antes de encerrar com caixinha')
      return
    }
    if (hasInvalidCaixinhaSplit) {
      setError('A caixinha deve ser divisível igualmente entre todos do staff')
      return
    }
    setLoading(true)
    try {
      await api.patch(`/sessions/${sessionId}/end`, {
        rake: parseFloat(endForm.rake),
        caixinha: parseFloat(endForm.caixinha),
      })
      setSuccess('Sessão encerrada!')
      setTimeout(() => router.back(), 2000)
    } catch (err: any) {
      setError('Erro ao encerrar sessão')
    } finally {
      setLoading(false)
    }
  }

  const sessionGameType = session?.gameType || session?.homeGame?.gameType

  if (sessionGameType === 'TOURNAMENT') {
    return (
      <div className="min-h-screen bg-zinc-950">
        <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-zinc-400 hover:text-white">←</button>
          <div>
            <h1 className="font-bold">Caixa indisponível</h1>
            <p className="text-xs text-zinc-400">{session?.homeGame?.name}</p>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-6 py-12">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-100">
            <h2 className="text-lg font-bold">Esta mesa foi criada como torneio</h2>
            <p className="mt-2 text-sm text-amber-200/90">
              O caixa atual pertence ao fluxo de cash game. A separacao entre cash game e torneio foi criada, mas o operacional especifico de torneio ainda precisa ser implementado antes de liberar esta tela.
            </p>
          </div>
        </main>
      </div>
    )
  }

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
          {allPlayersHaveCashedOut ? (
            <>
              <h2 className="text-lg font-bold mb-4">Encerramento</h2>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
                {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>}
                {success && <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg p-3">{success}</div>}
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                  <p className="text-sm font-semibold text-zinc-100">Todos os jogadores já realizaram cashout.</p>
                  <p className="mt-1 text-sm text-zinc-400">A partida está operacionalmente encerrada. Agora restam apenas os trâmites finais.</p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">Staff selecionado</p>
                  <p className="mt-2 text-sm text-zinc-200">
                    {staffAssignments.length > 0 ? staffAssignments.map((assignment) => assignment.user.name).join(', ') : 'Nenhum staff selecionado'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEndModal(true)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-lg transition-colors text-lg"
                >
                  Encerrar Partida
                </button>
                {pendingChips > 0 && (
                  <p className="text-sm text-zinc-400 text-center">
                    Fichas em aberto: <span className="font-semibold text-zinc-200">{formatChips(pendingChips)}</span>
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold mb-4">Registrar Transação</h2>
              <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
                {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>}
                {success && <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg p-3">{success}</div>}

                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 uppercase tracking-wide">Jogador</label>
                  <select
                    value={form.userId}
                    onChange={(e) => {
                      const userId = e.target.value
                      const ps = playerStates.find((p) => p.userId === userId)
                      setForm((prev) => ({ ...prev, userId }))
                      setTransactionType(ps ? 'REBUY' : 'BUYIN')
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-yellow-400"
                  >
                    <option value="">Selecione...</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 uppercase tracking-wide">Tipo</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['BUYIN', 'REBUY', 'CASHOUT'].map((t) => {
                      const isDisabled =
                        (t === 'BUYIN' && hasExistingBuyIn) ||
                        (t === 'CASHOUT' && Boolean(selectedPlayerState?.hasCashedOut)) ||
                        (t === 'REBUY' && Boolean(selectedPlayerState?.hasCashedOut))
                      return (
                        <button
                          key={t}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => !isDisabled && setTransactionType(t as 'BUYIN' | 'REBUY' | 'CASHOUT')}
                          className={`py-2 rounded-lg text-sm font-bold transition-colors ${
                            isDisabled
                              ? 'bg-zinc-800/60 text-zinc-500 cursor-not-allowed'
                              : currentType === t
                                ? 'bg-yellow-400 text-zinc-900'
                                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          }`}
                        >
                          {t}
                        </button>
                      )
                    })}
                  </div>
                  {hasExistingBuyIn && !selectedPlayerState?.hasCashedOut && (
                    <p className="text-xs text-zinc-500">Buy-in já realizado — disponível: REBUY e CASHOUT.</p>
                  )}
                  {selectedPlayerState?.hasCashedOut && (
                    <p className="text-xs text-zinc-500">Jogador já realizou cashout nesta sessão.</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 uppercase tracking-wide">Fichas</label>
                  <input type="number" min="0" value={form.chips} onChange={(e) => setForm((prev) => ({ ...prev, chips: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-yellow-400" placeholder="0" />
                  {currentType === 'CASHOUT' && playerStates.length > 0 && (
                    <p className="text-xs text-zinc-500">Máximo disponível: {formatChips(totalChipsInPlay)} fichas na mesa</p>
                  )}
                  {form.chips && chipValue && (
                    <p className="text-xs text-zinc-400">≈ {formatCurrency(parseFloat(form.chips) * chipValue)}</p>
                  )}
                </div>

                <button type="submit" disabled={loading}
                  className="w-full bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold py-3 rounded-lg transition-colors disabled:opacity-50">
                  {loading ? 'Registrando...' : 'Registrar'}
                </button>
              </form>
            </>
          )}
        </div>

        <div>
          <h2 className="text-lg font-bold mb-4">Jogadores</h2>
          <div className="space-y-3">
            {playerStates.length === 0 ? (
              <p className="text-zinc-500 text-sm">Nenhum jogador ainda</p>
            ) : (
              [...playerStates].sort((a, b) => parseFloat(b.result) - parseFloat(a.result)).map((p) => {
                const playerTransactions = transactions
                  .filter((transaction) => transaction.userId === p.userId)
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                const totalMoved = playerTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0)

                return (
                <div key={p.userId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">{p.user?.name || 'Jogador'}</span>
                    {p.hasCashedOut && <span className="text-xs bg-zinc-700 text-zinc-400 px-2 py-0.5 rounded">Cashout</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div><p className="text-zinc-500">Investido</p><p className="font-bold">{formatCurrency(p.chipsIn)}</p></div>
                    <div><p className="text-zinc-500">Sacado</p><p className="font-bold">{p.hasCashedOut ? formatCurrency(p.chipsOut) : '—'}</p></div>
                    <div>
                      {p.hasCashedOut ? (() => {
                        const result = parseFloat(p.result)
                        if (result < 0) return (
                          <>
                            <p className="text-zinc-500">Deve pagar</p>
                            <p className="font-bold text-red-400">{formatCurrency(Math.abs(result))}</p>
                          </>
                        )
                        if (result > 0) return (
                          <>
                            <p className="text-zinc-500">Deve receber</p>
                            <p className="font-bold text-green-400">{formatCurrency(result)}</p>
                          </>
                        )
                        return (
                          <>
                            <p className="text-zinc-500">Resultado</p>
                            <p className="font-bold text-zinc-400">Empatou</p>
                          </>
                        )
                      })() : (
                        <>
                          <p className="text-zinc-500">Stack</p>
                          <p className="font-bold">{formatChips(p.currentStack)}</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                    <div className="mb-3 flex items-center justify-between text-xs">
                      <p className="text-zinc-400 uppercase tracking-wide">Auditoria</p>
                      <p className="text-zinc-500">Total movimentado: <span className="font-semibold text-zinc-200">{formatCurrency(totalMoved)}</span></p>
                    </div>

                    {playerTransactions.length === 0 ? (
                      <p className="text-xs text-zinc-500">Sem transações registradas.</p>
                    ) : (
                      <div className="space-y-2">
                        {playerTransactions.map((transaction) => (
                          <div key={transaction.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-semibold text-zinc-100">{transactionTypeLabel[transaction.type]}</p>
                                <p className="text-zinc-500">{formatDateTime(transaction.createdAt)}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-zinc-100">{formatCurrency(transaction.amount)}</p>
                                <p className="text-zinc-500">{formatChips(transaction.chips)} fichas</p>
                              </div>
                            </div>
                            {transaction.note && <p className="mt-2 text-zinc-400">{transaction.note}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )})
            )}
          </div>
        </div>

      </main>

      {showEndModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-bold">Encerrar Partida</h2>
            
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4 text-sm">
              <p className="text-zinc-400">Fichas não casheadas:</p>
              <p className="text-lg font-bold text-yellow-400">{formatChips(pendingChips)} fichas</p>
              <p className="text-xs text-zinc-500 mt-2">≈ {formatCurrency(pendingChips * chipValue)}</p>
            </div>

            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4 text-sm">
              <p className="text-zinc-400">Staff da partida:</p>
              <p className="mt-2 text-zinc-100">{staffAssignments.length > 0 ? staffAssignments.map((assignment) => assignment.user.name).join(', ') : 'Nenhum staff selecionado'}</p>
              {parsedCaixinha > 0 && staffAssignments.length > 0 && (
                <p className="mt-2 text-xs text-zinc-400">Divisão da caixinha: {formatCurrency(caixinhaPerStaff)} por pessoa</p>
              )}
              {hasInvalidCaixinhaSplit && (
                <p className="mt-2 text-xs text-red-400">Valor inválido: a caixinha precisa dividir igualmente entre o total de staff.</p>
              )}
              {caixinhaDistributionPreview.length > 0 && (
                <div className="mt-3 space-y-2">
                  {caixinhaDistributionPreview.map((item) => (
                    <div key={item.userId} className="flex items-center justify-between rounded-md border border-zinc-700/70 bg-zinc-900/40 px-3 py-2 text-xs">
                      <span className="text-zinc-200">{item.name}</span>
                      <span className="font-semibold text-green-400">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleEndSession} className="space-y-4">
              {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>}
              {success && <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg p-3">{success}</div>}

              <div className="space-y-1">
                <label className="text-xs text-zinc-400 uppercase tracking-wide">Rake (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={endForm.rake}
                  onChange={(e) => setEndForm((prev) => ({ ...prev, rake: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-yellow-400"
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-zinc-400 uppercase tracking-wide">Caixinha (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={endForm.caixinha}
                  onChange={(e) => setEndForm((prev) => ({ ...prev, caixinha: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-yellow-400"
                  placeholder="0.00"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEndModal(false)}
                  disabled={loading}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || hasInvalidCaixinhaSplit}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? 'Encerrando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPrepaidModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-bold">Cobrança Pré-paga</h2>

            {prepaidChargeResult?.amount ? (
              <p className="text-sm text-zinc-300">Valor da compra: <span className="font-semibold text-zinc-100">{formatCurrency(prepaidChargeResult.amount)}</span></p>
            ) : null}

            {extractPixQrImage(prepaidChargeResult?.charge) ? (
              <div className="rounded-lg bg-white p-3">
                <img src={extractPixQrImage(prepaidChargeResult?.charge) || ''} alt="QR Code PIX" className="h-auto w-full" />
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-3 text-xs text-zinc-400">
                QR code não disponível no retorno da Annapay.
              </div>
            )}

            {extractPixCopyPaste(prepaidChargeResult?.charge) ? (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-zinc-500">PIX Copia e Cola</p>
                <textarea
                  readOnly
                  value={extractPixCopyPaste(prepaidChargeResult?.charge) || ''}
                  className="w-full min-h-[90px] rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-200"
                />
              </div>
            ) : null}

            <p className="text-xs text-zinc-400">Confirme o pagamento antes de registrar a compra no caixa.</p>

            {chargeStatusMessage && (
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-3 text-xs text-zinc-300">
                {chargeStatusMessage}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={verifyPrepaidChargeStatus}
                disabled={checkingChargeStatus || registeringPendingPrepaid}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                {checkingChargeStatus ? 'Consultando...' : 'Verificar pagamento'}
              </button>
              <button
                type="button"
                onClick={() => setShowPrepaidModal(false)}
                disabled={registeringPendingPrepaid}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={registerPendingPrepaidTransaction}
                disabled={registeringPendingPrepaid || !pendingPrepaidTransaction}
                className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                {registeringPendingPrepaid ? 'Registrando...' : 'Pagamento confirmado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
