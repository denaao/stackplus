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
  type: 'BUYIN' | 'REBUY' | 'ADDON' | 'CASHOUT' | 'JACKPOT'
  amount: string | number
  chips: string | number
  note?: string | null
  createdAt: string
}

interface StaffAssignment {
  userId: string
  user: { id: string; name: string; email?: string }
}

interface RakebackAssignment {
  userId: string
  percent?: number
  user: { id: string; name: string; email?: string }
}

interface PrepaidChargeResult {
  playerMode: 'POSTPAID' | 'PREPAID'
  requiresCharge: boolean
  amount: number
  charge?: any
}

interface PendingPrepaidTransaction {
  chargeId: string
  sessionId: string
  userId: string
  type: 'BUYIN' | 'REBUY' | 'ADDON'
  amount: number
  chips: number
  note?: string
  createdAt: number
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
  JACKPOT: 'JACKPOT',
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
    payload?.situacao,
    payload?.data?.status,
    payload?.data?.situacao,
    payload?.response?.status,
    payload?.response?.situacao,
    payload?.cob?.status,
    payload?.cob?.situacao,
    payload?.pix?.status,
  ]

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return null
}

function findStatusDeep(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null

  const stack: any[] = [payload]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || typeof current !== 'object') continue

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item)
      continue
    }

    const status = typeof current.status === 'string' ? current.status : null
    if (status && status.trim()) return status.trim()

    const situacao = typeof current.situacao === 'string' ? current.situacao : null
    if (situacao && situacao.trim()) return situacao.trim()

    for (const value of Object.values(current)) {
      if (value && typeof value === 'object') stack.push(value)
    }
  }

  return null
}

function hasConfirmedPix(payload: any): boolean {
  const stack: any[] = [payload]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || typeof current !== 'object') continue

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item)
      continue
    }

    const obj = current as Record<string, any>
    const keys = Object.keys(obj)

    if (keys.includes('endToEndId') || keys.includes('e2eId') || keys.includes('horario')) {
      return true
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') stack.push(value)
    }
  }

  return false
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
    'concluída',
    'finalizada',
    'aprovada',
    'approved',
  ].some((token) => normalized.includes(token))
}

function isPaidCobPayload(payload: any): boolean {
  const status = extractCobStatus(payload) || findStatusDeep(payload)
  if (isPaidCobStatus(status)) return true
  return hasConfirmedPix(payload)
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
  const [transactionType, setTransactionType] = useState<'BUYIN' | 'REBUY' | 'CASHOUT' | 'JACKPOT'>('BUYIN')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showEndModal, setShowEndModal] = useState(false)
  const [endForm, setEndForm] = useState({ rake: '', caixinha: '', jackpotArrecadado: '' })
  const [showPrepaidModal, setShowPrepaidModal] = useState(false)
  const [prepaidChargeResult, setPrepaidChargeResult] = useState<PrepaidChargeResult | null>(null)
  const [pendingPrepaidTransaction, setPendingPrepaidTransaction] = useState<PendingPrepaidTransaction | null>(null)
  const [registeringPendingPrepaid, setRegisteringPendingPrepaid] = useState(false)
  const [checkingChargeStatus, setCheckingChargeStatus] = useState(false)
  const [chargeStatusMessage, setChargeStatusMessage] = useState('')
  const [autoProcessingPaidCharge, setAutoProcessingPaidCharge] = useState(false)
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null)

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
      const memberMap = new Map<string, Member>()

      for (const m of membersResponse.data || []) {
        memberMap.set(m.user.id, {
          id: m.user.id,
          name: m.user.name,
          paymentMode: m.paymentMode || null,
        })
      }

      // Host may not exist in /groups/:homeGameId/members, so we merge selected
      // session participants to ensure anyone selected for the match appears.
      for (const assignment of Array.isArray(data.participantAssignments) ? data.participantAssignments : []) {
        if (!assignment?.userId || !assignment?.user?.name) continue
        if (!memberMap.has(assignment.userId)) {
          memberMap.set(assignment.userId, {
            id: assignment.userId,
            name: assignment.user.name,
            paymentMode: null,
          })
        }
      }

      const allMembers: Member[] = Array.from(memberMap.values())
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

      setPendingPrepaidTransaction((pending) => {
        if (!pending) return pending

        const sameUser = transaction.userId === pending.userId
        const sameType = transaction.type === pending.type
        const sameSession = pending.sessionId === sessionId
        const marker = `[charge:${pending.chargeId}]`
        const noteHasMarker = typeof transaction.note === 'string' && transaction.note.includes(marker)

        if (!sameUser || !sameType || !sameSession || !noteHasMarker) {
          return pending
        }

        setShowPrepaidModal(false)
        setPrepaidChargeResult(null)
        setChargeStatusMessage('')
        setAutoProcessingPaidCharge(false)
        setSuccess('Pagamento confirmado e transação registrada automaticamente.')
        setTimeout(() => setSuccess(''), 2500)

        return null
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
      if (parsedChips > selectedPlayerCurrentStack) {
        setError(`Cashout não pode exceder o stack atual do jogador (${selectedPlayerCurrentStack.toLocaleString('pt-BR')} fichas)`)
        setLoading(false)
        return
      }
    }
    setLoading(true)
    try {
      const amount = Number((parsedChips * chipValue).toFixed(2))
      const selectedMember = members.find((member) => member.id === form.userId)
      const playerMode = resolvePlayerPaymentMode(session?.financialModule || session?.homeGame?.financialModule, selectedMember?.paymentMode)

      const isPrepaidPurchase = transactionType === 'BUYIN' || transactionType === 'REBUY'
      if (isPrepaidPurchase && playerMode === 'PREPAID') {
        const purchaseType = transactionType as 'BUYIN' | 'REBUY'
        const { data } = await api.post('/banking/annapay/prepaid/purchase-charge', {
          sessionId,
          userId: form.userId,
          type: purchaseType,
          chips: parsedChips,
        })

        const chargeId = String(data?.charge?.id || '').trim()
        if (!chargeId) {
          setError('Cobrança gerada sem identificador. Tente novamente.')
          return
        }

        setPrepaidChargeResult(data)
        setPendingPrepaidTransaction({
          chargeId,
          sessionId,
          userId: form.userId,
          type: purchaseType,
          amount,
          chips: parsedChips,
          note: form.note || undefined,
          createdAt: Date.now(),
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
      const baseNote = pendingPrepaidTransaction.note?.trim() || ''
      const chargeMarker = `[charge:${pendingPrepaidTransaction.chargeId}]`
      const finalNote = [baseNote, chargeMarker].filter(Boolean).join(' ').trim()

      const { data } = await api.post('/cashier/transaction', {
        sessionId: pendingPrepaidTransaction.sessionId,
        userId: pendingPrepaidTransaction.userId,
        type: pendingPrepaidTransaction.type,
        amount: pendingPrepaidTransaction.amount,
        chips: pendingPrepaidTransaction.chips,
        note: finalNote || undefined,
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
      const errorMessage = typeof err?.response?.data?.error === 'string'
        ? err.response.data.error
        : (typeof err?.message === 'string' ? err.message : '')
      const normalizedError = errorMessage.toLowerCase()
      const isAlreadyRegistered = normalizedError.includes('buy-in já realizado') || normalizedError.includes('buy-in ja realizado')

      if (isAlreadyRegistered) {
        await refreshCashierSnapshot()
        setSuccess('Compra já registrada anteriormente. Painel sincronizado.')
        setShowPrepaidModal(false)
        setPendingPrepaidTransaction(null)
        setPrepaidChargeResult(null)
        setChargeStatusMessage('')
        setTimeout(() => setSuccess(''), 2500)
        return
      }

      if (closeOnStart) {
        setShowPrepaidModal(true)
      }
      if (options?.automatic) {
        setShowPrepaidModal(true)
      }
      setError(errorMessage || 'Erro ao registrar compra pré-paga')
      setChargeStatusMessage(errorMessage || 'Falha ao registrar compra após confirmação do pagamento.')
    } finally {
      setRegisteringPendingPrepaid(false)
      if (options?.automatic) {
        setAutoProcessingPaidCharge(false)
      }
    }
  }

  async function reconcilePendingPrepaidFromSnapshot() {
    if (!pendingPrepaidTransaction) return false

    const { data } = await api.get('/cashier/transactions', { params: { sessionId } })
    const list = Array.isArray(data) ? data as CashierTransaction[] : []

    const marker = `[charge:${pendingPrepaidTransaction.chargeId}]`
    const found = list.some((tx) => {
      if (tx.userId !== pendingPrepaidTransaction.userId) return false
      if (tx.type !== pendingPrepaidTransaction.type) return false

      return typeof tx.note === 'string' && tx.note.includes(marker)
    })

    if (!found) return false

    await refreshCashierSnapshot()
    setShowPrepaidModal(false)
    setPendingPrepaidTransaction(null)
    setPrepaidChargeResult(null)
    setAutoProcessingPaidCharge(false)
    setChargeStatusMessage('')
    setSuccess('Pagamento confirmado e transação sincronizada automaticamente.')
    setTimeout(() => setSuccess(''), 2500)

    return true
  }

  async function verifyPrepaidChargeStatus() {
    const chargeId = prepaidChargeResult?.charge?.id
    if (!chargeId) {
      setChargeStatusMessage('Cobrança sem identificador para consulta de status.')
      return
    }

    if (autoProcessingPaidCharge || registeringPendingPrepaid) {
      return
    }

    setCheckingChargeStatus(true)
    try {
      const virtualAccount = prepaidChargeResult?.charge?.virtualAccount
      const { data } = await api.post('/banking/annapay/prepaid/settle', {
        chargeId,
        virtualAccount: virtualAccount || undefined,
      })
      if (data?.settled) {
        setChargeStatusMessage('Pagamento identificado e registrado no servidor.')
        await refreshCashierSnapshot()
        setShowPrepaidModal(false)
        setPendingPrepaidTransaction(null)
        setPrepaidChargeResult(null)
        setAutoProcessingPaidCharge(false)
        setSuccess('Pagamento confirmado e transação registrada automaticamente.')
        setTimeout(() => setSuccess(''), 2500)
        return
      }

      setChargeStatusMessage(String(data?.message || 'Pagamento ainda não identificado.'))
    } catch (err: any) {
      const errorMessage = typeof err?.response?.data?.error === 'string'
        ? err.response.data.error
        : (typeof err?.message === 'string' ? err.message : 'Falha ao consultar status da cobrança.')
      setChargeStatusMessage(errorMessage)
    } finally {
      setCheckingChargeStatus(false)
    }
  }

  async function handleDeleteTransaction(transactionId: string) {
    if (!confirm('Excluir esta transação? Os cálculos do jogador serão refeitos automaticamente.')) return

    setDeletingTransactionId(transactionId)
    try {
      await api.delete(`/cashier/transaction/${transactionId}`)
      await refreshCashierSnapshot()
      setSuccess('Transação excluída e cálculos atualizados.')
      setTimeout(() => setSuccess(''), 2500)
    } catch (err: any) {
      const message = typeof err === 'string' ? err : 'Erro ao excluir transação'
      setError(message)
    } finally {
      setDeletingTransactionId(null)
    }
  }

  useEffect(() => {
    if (!showPrepaidModal || !prepaidChargeResult?.charge?.id) return

    let stopped = false
    const run = async () => {
      if (stopped || autoProcessingPaidCharge || registeringPendingPrepaid) return

      try {
        const alreadySettled = await reconcilePendingPrepaidFromSnapshot()
        if (alreadySettled) {
          stopped = true
          return
        }
      } catch {
        // Continue with status polling even if snapshot reconciliation fails once.
      }

      const chargeId = prepaidChargeResult.charge.id
      const virtualAccount = prepaidChargeResult.charge.virtualAccount
      try {
        const { data } = await api.post('/banking/annapay/prepaid/settle', {
          chargeId,
          virtualAccount: virtualAccount || undefined,
        })
        if (data?.settled) {
          setChargeStatusMessage('Pagamento identificado e registrado no servidor.')
          stopped = true
          await refreshCashierSnapshot()
          setShowPrepaidModal(false)
          setPendingPrepaidTransaction(null)
          setPrepaidChargeResult(null)
          setAutoProcessingPaidCharge(false)
          setSuccess('Pagamento confirmado e transação registrada automaticamente.')
          setTimeout(() => setSuccess(''), 2500)
          return
        }

        setChargeStatusMessage(String(data?.message || 'Aguardando pagamento...'))
      } catch (err: any) {
        const errorMessage = typeof err?.response?.data?.error === 'string'
          ? err.response.data.error
          : (typeof err?.message === 'string' ? err.message : 'Falha ao consultar status da cobrança.')
        setChargeStatusMessage(errorMessage)
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
  const isJackpotEnabled = session?.jackpotEnabled !== false
  const selectedPlayerState = playerStates.find((p) => p.userId === form.userId)
  const selectedPlayerCurrentStack = Number(selectedPlayerState?.currentStack || 0)
  const hasExistingBuyIn = Boolean(selectedPlayerState)
  const selectableMembers = members.filter((member) => {
    const state = playerStates.find((player) => player.userId === member.id)
    return !state?.hasCashedOut
  })
  const totalChipsInPlay = playerStates.reduce((sum, p) => sum + Number(p.currentStack || 0), 0)
  const currentType = transactionType

  const allPlayersHaveCashedOut = playerStates.length > 0 && playerStates.every((p) => p.hasCashedOut)
  const activePlayers = playerStates.filter((p) => !p.hasCashedOut)
  const pendingChips = playerStates.reduce((sum, p) => sum + Number(p.currentStack || 0), 0)
  const jackpotDistributed = transactions
    .filter((transaction) => transaction.type === 'JACKPOT')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0)
  const jackpotAtual = Number(session?.homeGame?.jackpotAccumulated || 0)
  const staffAssignments: StaffAssignment[] = Array.isArray(session?.staffAssignments) ? session.staffAssignments : []
  const rakebackAssignments: RakebackAssignment[] = Array.isArray(session?.rakebackAssignments) ? session.rakebackAssignments : []
  const parsedRake = parseFloat(endForm.rake || '0') || 0
  const parsedCaixinha = parseFloat(endForm.caixinha || '0') || 0
  const parsedJackpotArrecadado = parseFloat(endForm.jackpotArrecadado || '0') || 0
  const jackpotProjetado = Math.max(0, Number((jackpotAtual + parsedJackpotArrecadado - jackpotDistributed).toFixed(2)))
  const totalRakebackPercent = rakebackAssignments.reduce((sum, assignment) => {
    const value = Number(assignment.percent || 0)
    if (!Number.isFinite(value) || value <= 0) return sum
    return sum + value
  }, 0)
  const hasInvalidRakebackSplit = totalRakebackPercent > 100
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
  const rakebackDistributionPreview = parsedRake > 0 && rakebackAssignments.length > 0
    ? rakebackAssignments
      .filter((assignment) => Number(assignment.percent || 0) > 0)
      .map((assignment) => {
        const percent = Number(assignment.percent || 0)
        return {
          userId: assignment.userId,
          name: assignment.user.name,
          percent,
          amount: Number((parsedRake * percent / 100).toFixed(2)),
        }
      })
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
    if (hasInvalidRakebackSplit) {
      setError('A soma do rakeback do staff não pode passar de 100%')
      return
    }
    setLoading(true)
    try {
      await api.patch(`/sessions/${sessionId}/end`, {
        rake: parseFloat(endForm.rake),
        caixinha: parseFloat(endForm.caixinha),
        jackpotArrecadado: parsedJackpotArrecadado,
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
                    {selectableMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 uppercase tracking-wide">Tipo</label>
                  <div className="flex flex-col gap-2">
                    {(isJackpotEnabled
                      ? (['BUYIN', 'REBUY', 'CASHOUT', 'JACKPOT'] as const)
                      : (['BUYIN', 'REBUY', 'CASHOUT'] as const)).map((t) => {
                      const isDisabled =
                        (t === 'BUYIN' && hasExistingBuyIn) ||
                        (t === 'CASHOUT' && Boolean(selectedPlayerState?.hasCashedOut)) ||
                        (t === 'REBUY' && Boolean(selectedPlayerState?.hasCashedOut)) ||
                        (t === 'JACKPOT' && (!isJackpotEnabled || !hasExistingBuyIn || Boolean(selectedPlayerState?.hasCashedOut)))

                      const activeClass = t === 'CASHOUT'
                        ? 'bg-red-500 text-white border-2 border-red-300'
                        : t === 'JACKPOT'
                          ? 'bg-emerald-500 text-white border-2 border-emerald-300'
                        : 'bg-yellow-400 text-zinc-900 border-2 border-yellow-200'

                      const idleClass = t === 'CASHOUT'
                        ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-transparent'
                        : t === 'JACKPOT'
                          ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-transparent'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-transparent'

                      const label = t === 'JACKPOT' ? 'Receber JACKPOT' : t

                      return (
                        <button
                          key={t}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => !isDisabled && setTransactionType(t)}
                          className={`w-full py-2 rounded-lg text-sm font-bold transition-colors ${
                            isDisabled
                              ? 'bg-zinc-800/60 text-zinc-500 cursor-not-allowed'
                              : currentType === t
                                ? activeClass
                                : idleClass
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  {hasExistingBuyIn && !selectedPlayerState?.hasCashedOut && isJackpotEnabled && (
                    <p className="text-xs text-zinc-500">Buy-in já realizado — disponível: REBUY, CASHOUT e Receber JACKPOT.</p>
                  )}
                  {!hasExistingBuyIn && form.userId && isJackpotEnabled && (
                    <p className="text-xs text-zinc-500">JACKPOT fica disponível após o buy-in do jogador.</p>
                  )}
                  {selectedPlayerState?.hasCashedOut && (
                    <p className="text-xs text-zinc-500">Jogador já realizou cashout nesta sessão.</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 uppercase tracking-wide">
                    {currentType === 'JACKPOT' ? 'Fichas de prêmio JACKPOT' : 'Fichas'}
                  </label>
                  <input type="number" min="0" value={form.chips} onChange={(e) => setForm((prev) => ({ ...prev, chips: e.target.value }))}
                    className={`w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none ${currentType === 'JACKPOT' ? 'focus:border-emerald-400' : 'focus:border-yellow-400'}`} placeholder="0" />
                  {currentType === 'CASHOUT' && playerStates.length > 0 && (
                    <p className="text-xs text-zinc-500">Máximo disponível para este jogador: {formatChips(selectedPlayerCurrentStack)} fichas</p>
                  )}
                  {form.chips && chipValue && (
                    <p className="text-xs text-zinc-400">≈ {formatCurrency(parseFloat(form.chips) * chipValue)}</p>
                  )}
                </div>

                <button type="submit" disabled={loading}
                  className="w-full bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold py-3 rounded-lg transition-colors disabled:opacity-50">
                  {loading ? 'Registrando...' : 'Registrar'}
                </button>

                {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">{error}</div>}
                {success && <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg p-3">{success}</div>}
              </form>
            </>
          )}
        </div>

        <div>
          <h2 className="text-lg font-bold mb-4">Jogadores</h2>
          <div className="space-y-3">
            {activePlayers.length === 0 ? (
              <p className="text-zinc-500 text-sm">Nenhum jogador ainda</p>
            ) : (
              [...activePlayers].sort((a, b) => parseFloat(b.result) - parseFloat(a.result)).map((p) => {
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
                                <p className="text-zinc-500">
                                  {formatChips(transaction.chips)} fichas{transaction.type === 'JACKPOT' ? ' (prêmio)' : ''}
                                </p>
                              </div>
                            </div>
                            <div className="mt-2 flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleDeleteTransaction(transaction.id)}
                                disabled={deletingTransactionId === transaction.id}
                                className="rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                              >
                                {deletingTransactionId === transaction.id ? 'Excluindo...' : 'Excluir transação'}
                              </button>
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

            {isJackpotEnabled && (
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4 text-sm">
                <p className="text-zinc-400">JACKPOT distribuído:</p>
                <p className="text-lg font-bold text-emerald-400">{formatCurrency(jackpotDistributed)}</p>
                <p className="text-xs text-zinc-500 mt-2">Total distribuído nas transações do tipo JACKPOT nesta sessão.</p>
              </div>
            )}

            {isJackpotEnabled && (
              <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4 text-sm">
                <p className="text-zinc-400">JACKPOT atual do Home Game:</p>
                <p className="text-lg font-bold text-zinc-100">{formatCurrency(jackpotAtual)}</p>
                <p className="text-xs text-zinc-500 mt-2">Novo JACKPOT projetado: <span className="font-semibold text-emerald-300">{formatCurrency(jackpotProjetado)}</span></p>
              </div>
            )}

            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4 text-sm">
              <p className="text-zinc-400">Staff da partida:</p>
              <p className="mt-2 text-zinc-100">
                {staffAssignments.length > 0 ? staffAssignments.map((assignment) => assignment.user.name).join(', ') : 'Nenhum staff selecionado'}
              </p>
              <p className="mt-3 text-zinc-400">Rakeback:</p>
              <p className="mt-1 text-zinc-100">
                {rakebackAssignments.length > 0
                  ? rakebackAssignments.map((assignment) => `${assignment.user.name} (${Number(assignment.percent || 0).toFixed(2)}%)`).join(', ')
                  : 'Nenhum rakeback selecionado'}
              </p>
              {parsedRake > 0 && rakebackAssignments.length > 0 && (
                <p className="mt-2 text-xs text-zinc-400">Rakeback total configurado: {totalRakebackPercent.toFixed(2)}% do rake</p>
              )}
              {hasInvalidRakebackSplit && (
                <p className="mt-2 text-xs text-red-400">A soma das porcentagens de rakeback do staff não pode ultrapassar 100%.</p>
              )}
              {rakebackDistributionPreview.length > 0 && (
                <div className="mt-3 space-y-2">
                  {rakebackDistributionPreview.map((item) => (
                    <div key={`rakeback-${item.userId}`} className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
                      <span className="text-zinc-200">{item.name} ({item.percent.toFixed(2)}%)</span>
                      <span className="font-semibold text-amber-300">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
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

              {isJackpotEnabled && (
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 uppercase tracking-wide">Arrecadado JACKPOT (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={endForm.jackpotArrecadado}
                    onChange={(e) => setEndForm((prev) => ({ ...prev, jackpotArrecadado: e.target.value }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-emerald-400"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-zinc-500">Valor informado manualmente para arrecadação do JACKPOT na partida. {formatCurrency(parsedJackpotArrecadado)}</p>
                </div>
              )}

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

            <p className="text-xs text-zinc-400">Escaneie o QR code para efetuar o pagamento. O sistema verificará automaticamente, mas você também pode confirmar manualmente.</p>

            {chargeStatusMessage && (
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-3 text-xs text-zinc-300">
                {chargeStatusMessage}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => registerPendingPrepaidTransaction({ closeModalOnStart: true })}
                disabled={registeringPendingPrepaid || !pendingPrepaidTransaction || autoProcessingPaidCharge}
                className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-zinc-900 font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                {registeringPendingPrepaid ? 'Registrando...' : 'Pagamento confirmado'}
              </button>
              <button
                type="button"
                onClick={() => setShowPrepaidModal(false)}
                disabled={registeringPendingPrepaid || autoProcessingPaidCharge || checkingChargeStatus}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                {registeringPendingPrepaid ? 'Registrando...' : autoProcessingPaidCharge ? 'Processando pagamento...' : 'Fechar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
