'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'
import { joinSession, leaveSession, getSocket } from '@/services/socket'
import { useAuthStore } from '@/store/useStore'
import AppHeader from '@/components/AppHeader'
import HomeGameTabs from '@/components/HomeGameTabs'
import { getErrorMessage } from '@/lib/errors'
import { findStringDeep, getStringByPaths, hasAnyKeyDeep } from '@/lib/payload'

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
  registeredBy?: string | null
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

interface CashierSession {
  id: string
  status: string
  chipValue: string | null
  financialModule?: 'POSTPAID' | 'PREPAID' | 'HYBRID'
  gameType?: 'CASH_GAME' | 'TOURNAMENT'
  caixinhaMode?: 'SPLIT' | 'INDIVIDUAL'
  jackpotEnabled?: boolean
  homeGame: {
    id: string
    hostId: string
    name: string
    chipValue: string
    financialModule?: 'POSTPAID' | 'PREPAID' | 'HYBRID'
    gameType?: 'CASH_GAME' | 'TOURNAMENT'
    jackpotAccumulated?: string | number
  }
  participantAssignments?: Array<{ userId: string; user?: { id: string; name: string } }>
  playerStates?: Array<{ user?: { id: string; name: string } }>
  staffAssignments?: StaffAssignment[]
  rakebackAssignments?: RakebackAssignment[]
}

interface PrepaidChargeInfo {
  id: string
  virtualAccount?: string | null
  qrCodeBase64?: string | null
  pixCopyPaste?: string | null
  amount?: number
  // Payload bruto da ANNAPAY — os extract* helpers fazem o narrowing.
  [key: string]: unknown
}

interface PrepaidChargeResult {
  playerMode: 'POSTPAID' | 'PREPAID'
  requiresCharge: boolean
  amount: number
  charge?: PrepaidChargeInfo
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

function extractPixCopyPaste(payload: unknown): string | null {
  return getStringByPaths(payload, [
    ['pixCopiaECola'],
    ['pixCopyPaste'],
    ['copyPaste'],
    ['copiaECola'],
    ['links', 'emv'],
    ['pix', 'copiaECola'],
    ['pix', 'copyPaste'],
    ['charge', 'pixCopiaECola'],
    ['charge', 'links', 'emv'],
    ['charge', 'pix', 'copiaECola'],
    ['data', 'pixCopiaECola'],
  ])
}

function extractPixQrImage(payload: unknown): string | null {
  const raw = getStringByPaths(payload, [
    ['qrCodeBase64'],
    ['pixQrCodeBase64'],
    ['qrcode'],
    ['links', 'qrCode'],
    ['pix', 'qrcode'],
    ['charge', 'qrcode'],
    ['charge', 'qrCodeBase64'],
    ['charge', 'links', 'qrCode'],
    ['data', 'qrcode'],
  ])
  if (!raw) return null
  if (raw.startsWith('data:image')) return raw
  return `data:image/png;base64,${raw}`
}

function extractCobStatus(payload: unknown): string | null {
  return getStringByPaths(payload, [
    ['status'],
    ['situacao'],
    ['data', 'status'],
    ['data', 'situacao'],
    ['response', 'status'],
    ['response', 'situacao'],
    ['cob', 'status'],
    ['cob', 'situacao'],
    ['pix', 'status'],
  ])
}

function findStatusDeep(payload: unknown): string | null {
  return findStringDeep(payload, ['status', 'situacao'])
}

function hasConfirmedPix(payload: unknown): boolean {
  return hasAnyKeyDeep(payload, ['endToEndId', 'e2eId', 'horario'])
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

function isPaidCobPayload(payload: unknown): boolean {
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

const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)',
  border: '1px solid rgba(0,200,224,0.12)',
  borderRadius: '16px',
  padding: '16px',
}

const cardStyle2: React.CSSProperties = {
  background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)',
  border: '1px solid rgba(0,200,224,0.12)',
  borderRadius: '16px',
}

export default function CashierPage() {
  const router = useRouter()
  const params = useParams()
  const { user, logout } = useAuthStore()
  const sessionId = params.sessionId as string
  const [session, setSession] = useState<CashierSession | null>(null)
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
  // Modal de cashout direto por card do jogador
  const [cashoutPlayer, setCashoutPlayer] = useState<PlayerState | null>(null)
  const [cashoutChips, setCashoutChips] = useState('')
  const [cashoutLoading, setCashoutLoading] = useState(false)
  const [cashoutError, setCashoutError] = useState<string | null>(null)
  const [caixinhaByStaff, setCaixinhaByStaff] = useState<Record<string, string>>({})
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

      for (const state of Array.isArray(data.playerStates) ? data.playerStates : []) {
        if (!state?.user?.id || !state?.user?.name) continue
        if (!memberMap.has(state.user.id)) {
          memberMap.set(state.user.id, {
            id: state.user.id,
            name: state.user.name,
            paymentMode: null,
          })
        }
      }

      const allMembers: Member[] = Array.from(memberMap.values())
      const participantIds: string[] = Array.isArray(data.participantAssignments)
        ? (data.participantAssignments as Array<{ userId: string }>).map((assignment) => assignment.userId)
        : []
      const playerStateIds: string[] = Array.isArray(data.playerStates)
        ? (data.playerStates as Array<{ user?: { id?: string } }>)
            .map((s) => s?.user?.id)
            .filter((id): id is string => Boolean(id))
        : []
      const allowedIds = new Set<string>([...participantIds, ...playerStateIds])
      const filteredMembers = allowedIds.size > 0
        ? allMembers.filter((member) => allowedIds.has(member.id))
        : allMembers
      setMembers(filteredMembers)
      setTransactions(transactionsResponse.data)
    })

    joinSession(sessionId)
    const socket = getSocket()
    const onConnect = () => {
      console.log('[cashier] socket connected, (re)joining session', sessionId)
      joinSession(sessionId)
    }
    socket.on('connect', onConnect)
    if (socket.connected) {
      joinSession(sessionId)
    }
    socket.on('session:join:error', (payload: unknown) => {
      console.warn('[cashier] session:join:error', payload)
    })
    socket.on('transaction:new', ({ transaction, playerState }: { transaction: CashierTransaction; playerState: PlayerState }) => {
      setPlayerStates((prev) => {
        const exists = prev.find((p) => p.userId === playerState.userId)
        return exists ? prev.map((p) => p.userId === playerState.userId ? playerState : p) : [...prev, playerState]
      })
      if (playerState?.user?.id && playerState?.user?.name) {
        setMembers((prev) => {
          if (prev.some((m) => m.id === playerState.user.id)) return prev
          return [...prev, { id: playerState.user.id, name: playerState.user.name, paymentMode: null }]
        })
      }
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

    return () => {
      leaveSession(sessionId)
      socket.off('connect', onConnect)
      socket.off('session:join:error')
      socket.off('transaction:new')
      socket.off('ranking:updated')
    }
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
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao registrar'))
    } finally {
      setLoading(false)
    }
  }

  async function handleCashoutSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!cashoutPlayer) return
    const parsedChips = parseInt(cashoutChips || '0', 10)
    if (Number.isNaN(parsedChips) || parsedChips < 0) {
      setCashoutError('Informe uma quantidade de fichas válida (>= 0)')
      return
    }
    const amount = Number((parsedChips * chipValue).toFixed(2))
    setCashoutLoading(true)
    setCashoutError(null)
    try {
      const { data } = await api.post('/cashier/transaction', {
        sessionId,
        userId: cashoutPlayer.userId,
        type: 'CASHOUT',
        amount,
        chips: parsedChips,
      })
      applyRegisterResult(data as CashierRegisterResponse)
      await refreshCashierSnapshot()
      setCashoutPlayer(null)
      setCashoutChips('')
    } catch (err) {
      setCashoutError(getErrorMessage(err, 'Erro ao registrar cashout'))
    } finally {
      setCashoutLoading(false)
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
    } catch (err) {
      const errorMessage = getErrorMessage(err, '')
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
    } catch (err) {
      setChargeStatusMessage(getErrorMessage(err, 'Falha ao consultar status da cobrança.'))
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
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao excluir transação'))
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

      if (!prepaidChargeResult.charge) return
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
      } catch (err) {
        setChargeStatusMessage(getErrorMessage(err, 'Falha ao consultar status da cobrança.'))
      }
    }

    run()
    const timer = setInterval(run, 5000)

    return () => {
      stopped = true
      clearInterval(timer)
    }
    // reconcilePendingPrepaidFromSnapshot e refreshCashierSnapshot sao callbacks do escopo
    // mas nao estao memoizados. Incluir na dep causaria re-execucao em cada render.
    // O polling e intencionalmente disparado por mudancas no modal/charge/id apenas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPrepaidModal, prepaidChargeResult?.charge?.id, autoProcessingPaidCharge, registeringPendingPrepaid])

  const chipValue = session ? parseFloat(session.chipValue || session.homeGame.chipValue) : 1
  const isJackpotEnabled = session?.jackpotEnabled !== false
  const selectedPlayerState = playerStates.find((p) => p.userId === form.userId)
  const selectedPlayerCurrentStack = Number(selectedPlayerState?.currentStack || 0)
  const hasExistingBuyIn = Boolean(selectedPlayerState)
  // Todos os membros são selecionáveis — quem fez cashout pode re-entrar com novo buy-in
  const selectableMembers = members
  const totalChipsInPlay = playerStates.reduce((sum, p) => sum + Number(p.currentStack || 0), 0)
  const currentType = transactionType

  const allPlayersHaveCashedOut = playerStates.length > 0 && playerStates.every((p) => p.hasCashedOut)
  const activePlayers = playerStates.filter((p) => !p.hasCashedOut)
  const pendingChipsByPlayer = (() => {
    const map = new Map<string, { in: number; out: number; userId: string; name: string }>()
    for (const t of transactions) {
      const userId = t.userId
      if (!userId) continue
      const chips = Number(t.chips || 0)
      const entry = map.get(userId) || {
        in: 0,
        out: 0,
        userId,
        name: playerStates.find((p) => p.userId === userId)?.user.name
          || members.find((m) => m.id === userId)?.name
          || 'Jogador',
      }
      if (t.type === 'BUYIN' || t.type === 'REBUY' || t.type === 'ADDON' || t.type === 'JACKPOT') {
        entry.in += chips
      } else if (t.type === 'CASHOUT') {
        entry.out += chips
      }
      map.set(userId, entry)
    }
    return Array.from(map.values())
      .map((p) => ({ ...p, remaining: p.in - p.out, result: p.out - p.in }))
      .filter((p) => p.in > 0 || p.out > 0)
      .sort((a, b) => b.result - a.result)
  })()
  const pendingChips = pendingChipsByPlayer.reduce((sum, p) => sum + p.remaining, 0)
  const jackpotDistributed = transactions
    .filter((transaction) => transaction.type === 'JACKPOT')
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0)
  const jackpotAtual = Number(session?.homeGame?.jackpotAccumulated || 0)
  const staffAssignments: StaffAssignment[] = Array.isArray(session?.staffAssignments) ? session.staffAssignments : []
  const rakebackAssignments: RakebackAssignment[] = Array.isArray(session?.rakebackAssignments) ? session.rakebackAssignments : []
  const caixinhaMode: 'SPLIT' | 'INDIVIDUAL' = session?.caixinhaMode === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'SPLIT'
  const parsedRake = parseFloat(endForm.rake || '0') || 0
  const parsedCaixinhaSingle = parseFloat(endForm.caixinha || '0') || 0
  const parsedCaixinhaIndividualTotal = staffAssignments.reduce((sum, a) => {
    const value = parseFloat(caixinhaByStaff[a.userId] || '0') || 0
    return sum + (value > 0 ? value : 0)
  }, 0)
  const parsedCaixinha = caixinhaMode === 'INDIVIDUAL' ? parsedCaixinhaIndividualTotal : parsedCaixinhaSingle
  const parsedJackpotArrecadado = parseFloat(endForm.jackpotArrecadado || '0') || 0
  const jackpotProjetado = Math.max(0, Number((jackpotAtual + parsedJackpotArrecadado - jackpotDistributed).toFixed(2)))
  const totalRakebackPercent = rakebackAssignments.reduce((sum, assignment) => {
    const value = Number(assignment.percent || 0)
    if (!Number.isFinite(value) || value <= 0) return sum
    return sum + value
  }, 0)
  const hasInvalidRakebackSplit = totalRakebackPercent > 100
  const hasInvalidCaixinhaSplit = caixinhaMode === 'SPLIT' && parsedCaixinhaSingle > 0 && staffAssignments.length > 0
    ? Math.round(parsedCaixinhaSingle * 100) % staffAssignments.length !== 0
    : false
  const caixinhaPerStaff = staffAssignments.length > 0
    ? Number((parsedCaixinhaSingle / staffAssignments.length).toFixed(2))
    : 0
  const caixinhaDistributionPreview = caixinhaMode === 'SPLIT'
    ? (!hasInvalidCaixinhaSplit && parsedCaixinhaSingle > 0 && staffAssignments.length > 0
        ? staffAssignments.map((assignment) => ({
          userId: assignment.userId,
          name: assignment.user.name,
          amount: caixinhaPerStaff,
        }))
        : [])
    : staffAssignments.map((assignment) => ({
        userId: assignment.userId,
        name: assignment.user.name,
        amount: parseFloat(caixinhaByStaff[assignment.userId] || '0') || 0,
      })).filter((item) => item.amount > 0)
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
    if (!endForm.rake) {
      setError('Preencha o Rake')
      return
    }
    if (caixinhaMode === 'SPLIT' && !endForm.caixinha) {
      setError('Preencha a Caixinha')
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
      const payload: Record<string, unknown> = {
        rake: parseFloat(endForm.rake),
        jackpotArrecadado: parsedJackpotArrecadado,
      }
      if (caixinhaMode === 'INDIVIDUAL') {
        payload.caixinhaByStaff = staffAssignments.map((a) => ({
          userId: a.userId,
          amount: parseFloat(caixinhaByStaff[a.userId] || '0') || 0,
        }))
      } else {
        payload.caixinha = parseFloat(endForm.caixinha)
      }
      await api.patch(`/sessions/${sessionId}/end`, payload)
      setSuccess('Sessão encerrada!')
      setTimeout(() => router.back(), 2000)
    } catch (err) {
      setError('Erro ao encerrar sessão')
    } finally {
      setLoading(false)
    }
  }

  const sessionGameType = session?.gameType || session?.homeGame?.gameType

  if (sessionGameType === 'TOURNAMENT') {
    return (
      <div style={{ minHeight: '100vh', background: '#050D15' }}>
        <AppHeader
          title={session?.homeGame?.name ?? 'Caixa indisponível'}
          onBack={() => router.back()}
          userName={user?.name}
          onLogout={() => { logout(); router.push('/') }}
        />
        <main style={{ maxWidth: '768px', margin: '0 auto', padding: '48px 16px' }}>
          <div style={{ borderRadius: '16px', border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.08)', padding: '24px', color: '#fde68a' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '8px' }}>Esta mesa foi criada como torneio</h2>
            <p style={{ fontSize: '14px', color: 'rgba(253,230,138,0.8)', margin: 0 }}>
              O caixa pertence ao fluxo de cash game. Use a tela de torneio para gerenciar este evento.
            </p>
          </div>
        </main>
      </div>
    )
  }

  // Type button config — Cashout agora é feito via botão no card de cada jogador.
  const typeButtons = (isJackpotEnabled
    ? (['BUYIN', 'REBUY', 'JACKPOT'] as const)
    : (['BUYIN', 'REBUY'] as const))

  const typeConfig: Record<string, { label: string; activeGrad: string; activeBorder: string; idleColor: string }> = {
    BUYIN:  { label: 'Buy-in',  activeGrad: 'linear-gradient(135deg,#006070,#003848)', activeBorder: '#00C8E0', idleColor: 'rgba(0,200,224,0.15)' },
    REBUY:  { label: 'Rebuy',   activeGrad: 'linear-gradient(135deg,#1e3a8a,#0f1e5c)', activeBorder: '#60a5fa', idleColor: 'rgba(96,165,250,0.12)' },
    CASHOUT:{ label: 'Cashout', activeGrad: 'linear-gradient(135deg,#7f1d1d,#450a0a)', activeBorder: '#f87171', idleColor: 'rgba(248,113,113,0.12)' },
    JACKPOT:{ label: 'Jackpot', activeGrad: 'linear-gradient(135deg,#005A73,#002A3A)', activeBorder: '#00C8E0', idleColor: 'rgba(0,200,224,0.12)' },
  }

  return (
    <div style={{ minHeight: '100vh', background: '#050D15', color: '#e2e8f0' }}>
      <AppHeader
        title={session?.homeGame?.name ?? 'Caixa'}
        onBack={() => router.back()}
        userName={user?.name}
        onLogout={() => { logout(); router.push('/') }}
        rightSlot={playerStates.length > 0 ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ background: 'rgba(0,200,224,0.08)', border: '1px solid rgba(0,200,224,0.15)', borderRadius: '20px', padding: '3px 10px', fontSize: '12px' }}>
              <span style={{ color: '#4A7A90' }}>fichas </span>
              <span style={{ color: '#00C8E0', fontWeight: 700 }}>{formatChips(totalChipsInPlay)}</span>
            </div>
            <div style={{ background: 'rgba(0,200,224,0.08)', border: '1px solid rgba(0,200,224,0.15)', borderRadius: '20px', padding: '3px 10px', fontSize: '12px' }}>
              <span style={{ color: '#4A7A90' }}>jogadores </span>
              <span style={{ color: '#00C8E0', fontWeight: 700 }}>{activePlayers.length}</span>
            </div>
          </div>
        ) : undefined}
      />
      {session?.homeGame?.id && <HomeGameTabs homeGameId={session.homeGame.id} active="CASH" />}

      <main style={{ maxWidth: '768px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Global feedback (apenas erros — sucesso aparece dentro do card da acao) */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' }}>{error}</div>
        )}

        {/* === ENCERRAMENTO (todos cashearam) === */}
        {allPlayersHaveCashedOut ? (
          <div style={cardStyle}>
            <div style={{ marginBottom: '12px' }}>
              <p style={{ fontWeight: 700, fontSize: '15px', color: '#fff', margin: '0 0 4px' }}>Todos os jogadores realizaram cashout</p>
              <p style={{ fontSize: '13px', color: '#4A7A90', margin: 0 }}>A partida está operacionalmente encerrada.</p>
            </div>
            {staffAssignments.length > 0 && (
              <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '12px' }}>
                <span style={{ color: '#4A7A90' }}>Staff: </span>{staffAssignments.map((a) => a.user.name).join(', ')}
              </p>
            )}
            {pendingChips > 0 && (
              <p style={{ fontSize: '13px', color: '#4A7A90', marginBottom: '12px' }}>
                Fichas em aberto: <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{formatChips(pendingChips)}</span>
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowEndModal(true)}
              style={{ width: '100%', background: 'linear-gradient(135deg,#005A73,#002A3A)', border: '1px solid rgba(0,200,224,0.35)', borderRadius: '10px', color: '#00C8E0', fontWeight: 700, fontSize: '15px', padding: '14px', cursor: 'pointer' }}
            >
              Encerrar Partida
            </button>
          </div>
        ) : (
          /* === FORMULÁRIO DE TRANSAÇÃO === */
          <div style={cardStyle}>
            <p style={{ fontWeight: 700, fontSize: '14px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Registrar transação</p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Jogador */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Jogador</label>
                <select
                  value={form.userId}
                  onChange={(e) => {
                    const userId = e.target.value
                    const ps = playerStates.find((p) => p.userId === userId)
                    setForm((prev) => ({ ...prev, userId }))
                    setTransactionType(ps && !ps.hasCashedOut ? 'REBUY' : 'BUYIN')
                  }}
                  style={{ width: '100%', background: '#0A1F30', border: '1px solid rgba(0,200,224,0.15)', borderRadius: '10px', padding: '10px 14px', fontSize: '14px', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
                >
                  <option value="">Selecione...</option>
                  {selectableMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>

              {/* Tipo — grid 2×2 */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Tipo</label>
                <div style={{ display: 'grid', gridTemplateColumns: isJackpotEnabled ? '1fr 1fr' : '1fr 1fr 1fr', gap: '8px' }}>
                  {typeButtons.map((t) => {
                    const isDisabled =
                      (t === 'BUYIN' && hasExistingBuyIn && !selectedPlayerState?.hasCashedOut) ||
                      (t === 'REBUY' && (!hasExistingBuyIn || Boolean(selectedPlayerState?.hasCashedOut))) ||
                      (t === 'JACKPOT' && (!isJackpotEnabled || !hasExistingBuyIn || Boolean(selectedPlayerState?.hasCashedOut)))
                    const cfg = typeConfig[t]
                    const isActive = currentType === t

                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => !isDisabled && setTransactionType(t)}
                        style={{
                          padding: '10px 8px',
                          borderRadius: '10px',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s',
                          background: isDisabled
                            ? 'rgba(10,31,48,0.5)'
                            : isActive
                              ? cfg.activeGrad
                              : cfg.idleColor,
                          border: isDisabled
                            ? '1px solid rgba(255,255,255,0.05)'
                            : isActive
                              ? `1px solid ${cfg.activeBorder}`
                              : '1px solid transparent',
                          color: isDisabled
                            ? '#4A7A90'
                            : isActive
                              ? '#fff'
                              : '#94a3b8',
                          opacity: isDisabled ? 0.5 : 1,
                        }}
                      >
                        {cfg.label}
                      </button>
                    )
                  })}
                </div>
                {selectedPlayerState?.hasCashedOut && (
                  <p style={{ fontSize: '12px', color: '#4A7A90', marginTop: '6px' }}>Jogador já realizou cashout nesta sessão.</p>
                )}
              </div>

              {/* Fichas */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                  {currentType === 'JACKPOT' ? 'Fichas de prêmio JACKPOT' : 'Fichas'}
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.chips}
                  onChange={(e) => setForm((prev) => ({ ...prev, chips: e.target.value }))}
                  placeholder="0"
                  style={{ width: '100%', background: '#0A1F30', border: `1px solid ${currentType === 'JACKPOT' ? 'rgba(0,200,224,0.25)' : 'rgba(0,200,224,0.15)'}`, borderRadius: '10px', padding: '10px 14px', fontSize: '14px', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
                />
                {currentType === 'CASHOUT' && playerStates.length > 0 && (
                  <p style={{ fontSize: '12px', color: '#4A7A90', marginTop: '4px' }}>Stack atual: {formatChips(selectedPlayerCurrentStack)} fichas</p>
                )}
                {form.chips && chipValue && (
                  <p style={{ fontSize: '12px', color: '#4A7A90', marginTop: '4px' }}>≈ {formatCurrency(parseFloat(form.chips) * chipValue)}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{ width: '100%', background: loading ? 'rgba(0,200,224,0.3)' : 'linear-gradient(135deg,#006070,#003848)', border: '1px solid rgba(0,200,224,0.4)', borderRadius: '10px', color: loading ? '#4A7A90' : '#00C8E0', fontWeight: 700, fontSize: '15px', padding: '13px', cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                {loading ? 'Registrando...' : 'Registrar'}
              </button>

              {success && (
                <div style={{ background: 'rgba(0,200,224,0.1)', border: '1px solid rgba(0,200,224,0.3)', color: '#86efac', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', textAlign: 'center' }}>
                  {success}
                </div>
              )}
            </form>
          </div>
        )}

        {/* === JOGADORES === */}
        {playerStates.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <p style={{ fontWeight: 700, fontSize: '14px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Jogadores</p>
              {playerStates.length - activePlayers.length > 0 && (
                <span style={{ fontSize: '12px', color: '#4A7A90', background: 'rgba(0,200,224,0.06)', border: '1px solid rgba(0,200,224,0.1)', borderRadius: '20px', padding: '2px 10px' }}>
                  {playerStates.length - activePlayers.length} encerraram
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[...activePlayers].sort((a, b) => parseFloat(b.result) - parseFloat(a.result)).map((p) => {
                const playerTransactions = transactions
                  .filter((t) => t.userId === p.userId)
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

                const resultNum = parseFloat(p.result || '0')
                const borderColor = p.hasCashedOut
                  ? resultNum > 0 ? '#00C8E0' : resultNum < 0 ? '#f87171' : '#4A7A90'
                  : '#00C8E0'

                return (
                  <div key={p.userId} style={{ ...cardStyle2, overflow: 'hidden' }}>
                    {/* Colored left accent */}
                    <div style={{ display: 'flex' }}>
                      <div style={{ width: '3px', background: borderColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, padding: '14px' }}>
                        {/* Player header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <div>
                            <p style={{ fontWeight: 700, fontSize: '15px', margin: 0 }}>{p.user?.name || 'Jogador'}</p>
                            {p.hasCashedOut && (
                              <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.06)', color: '#4A7A90', padding: '2px 8px', borderRadius: '20px', display: 'inline-block', marginTop: '3px' }}>Cashout</span>
                            )}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {p.hasCashedOut ? (
                              <>
                                <p style={{ fontSize: '11px', color: '#4A7A90', margin: '0 0 2px' }}>{resultNum >= 0 ? 'Deve receber' : 'Deve pagar'}</p>
                                <p style={{ fontWeight: 700, fontSize: '16px', margin: 0, color: resultNum > 0 ? '#00C8E0' : resultNum < 0 ? '#f87171' : '#4A7A90' }}>
                                  {formatCurrency(Math.abs(resultNum))}
                                </p>
                              </>
                            ) : (
                              <>
                                <p style={{ fontSize: '11px', color: '#4A7A90', margin: '0 0 2px' }}>Stack</p>
                                <p style={{ fontWeight: 700, fontSize: '16px', margin: 0, color: '#00C8E0' }}>{formatChips(p.currentStack)}</p>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Botão Cashout direto (só quando jogador ainda ativo) */}
                        {!p.hasCashedOut && (
                          <button
                            type="button"
                            onClick={() => { setCashoutPlayer(p); setCashoutChips(String(p.currentStack || 0)); setCashoutError(null) }}
                            style={{
                              width: '100%',
                              marginBottom: '10px',
                              background: 'linear-gradient(135deg,#7f1d1d,#450a0a)',
                              border: '1px solid rgba(248,113,113,0.4)',
                              borderRadius: '8px',
                              color: '#f87171',
                              fontWeight: 700,
                              fontSize: '13px',
                              padding: '8px',
                              cursor: 'pointer',
                            }}
                          >
                            Cashout
                          </button>
                        )}

                        {/* Stats row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '8px 10px' }}>
                            <p style={{ fontSize: '11px', color: '#4A7A90', margin: '0 0 2px' }}>Investido</p>
                            <p style={{ fontWeight: 700, fontSize: '14px', margin: 0 }}>{formatCurrency(p.chipsIn)}</p>
                          </div>
                          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '8px 10px' }}>
                            <p style={{ fontSize: '11px', color: '#4A7A90', margin: '0 0 2px' }}>Sacado</p>
                            <p style={{ fontWeight: 700, fontSize: '14px', margin: 0 }}>{p.hasCashedOut ? formatCurrency(p.chipsOut) : '—'}</p>
                          </div>
                        </div>

                        {/* Transactions */}
                        {playerTransactions.length > 0 && (
                          <div style={{ borderTop: '1px solid rgba(0,200,224,0.08)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <p style={{ fontSize: '11px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Transações</p>
                            {playerTransactions.map((tx) => {
                              const isSangeur = typeof tx.registeredBy === 'string' && tx.registeredBy.startsWith('sangeur:')
                              return (
                                <div key={tx.id} style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,200,224,0.06)', borderRadius: '8px', padding: '8px 10px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{
                                        fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                                        borderRadius: '4px', padding: '2px 6px',
                                        border: isSangeur ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(0,200,224,0.3)',
                                        background: isSangeur ? 'rgba(168,85,247,0.1)' : 'rgba(0,200,224,0.08)',
                                        color: isSangeur ? '#c084fc' : '#00C8E0',
                                      }}>
                                        {isSangeur ? 'Sangeur' : 'Caixa'}
                                      </span>
                                      <div>
                                        <p style={{ fontWeight: 600, fontSize: '13px', margin: 0 }}>{transactionTypeLabel[tx.type]}</p>
                                        <p style={{ fontSize: '11px', color: '#4A7A90', margin: 0 }}>{formatDateTime(tx.createdAt)}</p>
                                      </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                      <p style={{ fontWeight: 600, fontSize: '13px', margin: 0 }}>{formatCurrency(tx.amount)}</p>
                                      <p style={{ fontSize: '11px', color: '#4A7A90', margin: 0 }}>{formatChips(tx.chips)} fichas</p>
                                    </div>
                                  </div>
                                  {tx.note && <p style={{ fontSize: '11px', color: '#4A7A90', marginTop: '4px' }}>{tx.note}</p>}
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteTransaction(tx.id)}
                                      disabled={deletingTransactionId === tx.id}
                                      style={{ fontSize: '11px', fontWeight: 700, color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: '6px', padding: '3px 10px', cursor: deletingTransactionId === tx.id ? 'not-allowed' : 'pointer', opacity: deletingTransactionId === tx.id ? 0.6 : 1 }}
                                    >
                                      {deletingTransactionId === tx.id ? 'Excluindo...' : 'Excluir'}
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </main>

      {/* === MODAL CASHOUT === */}
      {cashoutPlayer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div style={{ background: 'linear-gradient(180deg,#0C2238 0%,#071828 100%)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '16px', width: '100%', maxWidth: '420px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <h3 style={{ fontWeight: 700, fontSize: '17px', color: '#fff', margin: 0 }}>Cashout</h3>
              <button
                type="button"
                onClick={() => { setCashoutPlayer(null); setCashoutChips(''); setCashoutError(null) }}
                style={{ background: 'transparent', border: 'none', color: '#4A7A90', fontSize: '18px', cursor: 'pointer' }}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: '13px', color: '#4A7A90', margin: '0 0 16px' }}>
              {cashoutPlayer.user?.name || 'Jogador'} — stack atual <span style={{ color: '#00C8E0', fontWeight: 700 }}>{formatChips(cashoutPlayer.currentStack)}</span> fichas
            </p>

            <form onSubmit={handleCashoutSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                  Fichas de saída
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={cashoutChips}
                  onChange={(e) => setCashoutChips(e.target.value)}
                  autoFocus
                  style={{ width: '100%', background: '#0A1F30', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '10px', padding: '12px 14px', fontSize: '18px', color: '#fff', outline: 'none', boxSizing: 'border-box', fontWeight: 700 }}
                />
                {cashoutChips && (
                  <p style={{ fontSize: '12px', color: '#4A7A90', marginTop: '6px' }}>
                    ≈ {formatCurrency(parseInt(cashoutChips || '0', 10) * chipValue)}
                  </p>
                )}
              </div>

              {cashoutError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' }}>
                  {cashoutError}
                </div>
              )}

              <button
                type="submit"
                disabled={cashoutLoading}
                style={{
                  width: '100%',
                  background: cashoutLoading ? 'rgba(248,113,113,0.3)' : 'linear-gradient(135deg,#7f1d1d,#450a0a)',
                  border: '1px solid rgba(248,113,113,0.5)',
                  borderRadius: '10px',
                  color: cashoutLoading ? '#4A7A90' : '#f87171',
                  fontWeight: 700,
                  fontSize: '15px',
                  padding: '13px',
                  cursor: cashoutLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {cashoutLoading ? 'Registrando...' : 'Confirmar cashout'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* === MODAL ENCERRAMENTO === */}
      {showEndModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, padding: '0' }}>
          <div style={{ background: 'linear-gradient(180deg,#0C2238 0%,#071828 100%)', border: '1px solid rgba(0,200,224,0.15)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '768px', maxHeight: '90vh', overflowY: 'auto', padding: '24px 20px 32px' }}>
            <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.15)', borderRadius: '4px', margin: '0 auto 20px' }} />
            <h2 style={{ fontWeight: 700, fontSize: '18px', margin: '0 0 16px' }}>Encerrar Partida</h2>

            {/* Fichas pendentes */}
            <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,200,224,0.1)', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
              <p style={{ fontSize: '12px', color: '#4A7A90', margin: '0 0 4px' }}>Fichas não casheadas</p>
              <p style={{ fontWeight: 700, fontSize: '20px', color: '#00C8E0', margin: '0 0 2px' }}>{formatChips(pendingChips)}</p>
              <p style={{ fontSize: '12px', color: '#4A7A90', margin: 0 }}>≈ {formatCurrency(pendingChips * chipValue)}</p>
              {pendingChipsByPlayer.length > 0 && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(0,200,224,0.08)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {pendingChipsByPlayer.map((pl) => (
                    <div key={pl.userId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{pl.name}</span>
                      <span style={{ color: pl.result > 0 ? '#00C8E0' : pl.result < 0 ? '#f87171' : '#4A7A90', fontWeight: 600, marginLeft: '8px' }}>
                        {pl.result > 0 ? '+' : ''}{formatChips(pl.result)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {isJackpotEnabled && (
              <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,200,224,0.12)', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
                <p style={{ fontSize: '12px', color: '#4A7A90', margin: '0 0 4px' }}>JACKPOT distribuído nesta partida</p>
                <p style={{ fontWeight: 700, fontSize: '16px', color: '#00C8E0', margin: '0 0 4px' }}>{formatCurrency(jackpotDistributed)}</p>
                <p style={{ fontSize: '12px', color: '#4A7A90', margin: 0 }}>Jackpot atual: {formatCurrency(jackpotAtual)} → projetado: <span style={{ color: '#86efac' }}>{formatCurrency(jackpotProjetado)}</span></p>
              </div>
            )}

            {staffAssignments.length > 0 && (
              <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,200,224,0.1)', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
                <p style={{ fontSize: '12px', color: '#4A7A90', margin: '0 0 4px' }}>Staff</p>
                <p style={{ fontSize: '13px', color: '#e2e8f0', margin: '0 0 8px' }}>{staffAssignments.map((a) => a.user.name).join(', ')}</p>
                {rakebackAssignments.length > 0 && (
                  <>
                    <p style={{ fontSize: '12px', color: '#4A7A90', margin: '4px 0 4px' }}>Rakeback</p>
                    <p style={{ fontSize: '13px', color: '#e2e8f0', margin: 0 }}>
                      {rakebackAssignments.map((a) => `${a.user.name} (${Number(a.percent || 0).toFixed(2)}%)`).join(', ')}
                    </p>
                    {hasInvalidRakebackSplit && <p style={{ fontSize: '12px', color: '#f87171', marginTop: '4px' }}>A soma do rakeback não pode ultrapassar 100%.</p>}
                    {rakebackDistributionPreview.length > 0 && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {rakebackDistributionPreview.map((item) => (
                          <div key={`rb-${item.userId}`} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}>
                            <span>{item.name} ({item.percent.toFixed(2)}%)</span>
                            <span style={{ color: '#fbbf24', fontWeight: 600 }}>{formatCurrency(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <form onSubmit={handleEndSession} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' }}>{error}</div>}
              {success && <div style={{ background: 'rgba(0,200,224,0.1)', border: '1px solid rgba(0,200,224,0.3)', color: '#86efac', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' }}>{success}</div>}

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Rake (R$)</label>
                <input type="number" step="0.01" min="0" value={endForm.rake} onChange={(e) => setEndForm((p) => ({ ...p, rake: e.target.value }))} placeholder="0.00"
                  style={{ width: '100%', background: '#0A1F30', border: '1px solid rgba(0,200,224,0.15)', borderRadius: '10px', padding: '10px 14px', fontSize: '14px', color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              {caixinhaMode === 'INDIVIDUAL' ? (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Caixinha por staff (R$)</label>
                  {staffAssignments.length === 0
                    ? <p style={{ fontSize: '13px', color: '#4A7A90' }}>Nenhum staff selecionado.</p>
                    : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {staffAssignments.map((a) => (
                          <div key={a.userId} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ flex: 1, fontSize: '14px', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.user.name}</span>
                            <input type="number" step="0.01" min="0" value={caixinhaByStaff[a.userId] ?? ''} onChange={(e) => setCaixinhaByStaff((p) => ({ ...p, [a.userId]: e.target.value }))} placeholder="0.00"
                              style={{ width: '120px', background: '#0A1F30', border: '1px solid rgba(0,200,224,0.15)', borderRadius: '10px', padding: '8px 12px', fontSize: '14px', color: '#fff', outline: 'none' }} />
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid rgba(0,200,224,0.08)', fontSize: '13px' }}>
                          <span style={{ color: '#4A7A90' }}>Total caixinha</span>
                          <span style={{ fontWeight: 700 }}>{formatCurrency(parsedCaixinha)}</span>
                        </div>
                      </div>
                    )}
                </div>
              ) : (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Caixinha (R$)</label>
                  <input type="number" step="0.01" min="0" value={endForm.caixinha} onChange={(e) => setEndForm((p) => ({ ...p, caixinha: e.target.value }))} placeholder="0.00"
                    style={{ width: '100%', background: '#0A1F30', border: '1px solid rgba(0,200,224,0.15)', borderRadius: '10px', padding: '10px 14px', fontSize: '14px', color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
                  {hasInvalidCaixinhaSplit && <p style={{ fontSize: '12px', color: '#f87171', marginTop: '4px' }}>A caixinha precisa dividir igualmente entre o staff.</p>}
                  {caixinhaDistributionPreview.length > 0 && (
                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {caixinhaDistributionPreview.map((item) => (
                        <div key={item.userId} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(0,200,224,0.08)', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}>
                          <span>{item.name}</span>
                          <span style={{ color: '#00C8E0', fontWeight: 600 }}>{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {isJackpotEnabled && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Arrecadado JACKPOT (R$)</label>
                  <input type="number" step="0.01" min="0" value={endForm.jackpotArrecadado} onChange={(e) => setEndForm((p) => ({ ...p, jackpotArrecadado: e.target.value }))} placeholder="0.00"
                    style={{ width: '100%', background: '#0A1F30', border: '1px solid rgba(0,200,224,0.2)', borderRadius: '10px', padding: '10px 14px', fontSize: '14px', color: '#fff', outline: 'none', boxSizing: 'border-box' }} />
                  <p style={{ fontSize: '12px', color: '#4A7A90', marginTop: '4px' }}>Valor manual da arrecadação de JACKPOT nesta partida. {parsedJackpotArrecadado > 0 ? formatCurrency(parsedJackpotArrecadado) : ''}</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button type="button" onClick={() => setShowEndModal(false)} disabled={loading}
                  style={{ flex: 1, background: 'rgba(10,31,48,0.8)', border: '1px solid rgba(0,200,224,0.15)', borderRadius: '10px', color: '#94a3b8', fontWeight: 700, fontSize: '15px', padding: '13px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}>
                  Cancelar
                </button>
                <button type="submit" disabled={loading || hasInvalidCaixinhaSplit}
                  style={{ flex: 1, background: (loading || hasInvalidCaixinhaSplit) ? 'rgba(0,90,115,0.4)' : 'linear-gradient(135deg,#005A73,#002A3A)', border: '1px solid rgba(0,200,224,0.35)', borderRadius: '10px', color: '#00C8E0', fontWeight: 700, fontSize: '15px', padding: '13px', cursor: (loading || hasInvalidCaixinhaSplit) ? 'not-allowed' : 'pointer', opacity: (loading || hasInvalidCaixinhaSplit) ? 0.6 : 1 }}>
                  {loading ? 'Encerrando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* === MODAL PREPAID PIX === */}
      {showPrepaidModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'linear-gradient(180deg,#0C2238 0%,#071828 100%)', border: '1px solid rgba(0,200,224,0.15)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '768px', maxHeight: '90vh', overflowY: 'auto', padding: '24px 20px 32px' }}>
            <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.15)', borderRadius: '4px', margin: '0 auto 20px' }} />
            <h2 style={{ fontWeight: 700, fontSize: '18px', margin: '0 0 16px' }}>Cobrança Pré-paga</h2>

            {prepaidChargeResult?.amount ? (
              <p style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '14px' }}>
                Valor: <span style={{ fontWeight: 700, color: '#fff' }}>{formatCurrency(prepaidChargeResult.amount)}</span>
              </p>
            ) : null}

            {extractPixQrImage(prepaidChargeResult?.charge) ? (
              <div style={{ background: '#fff', borderRadius: '12px', padding: '12px', marginBottom: '14px' }}>
                {/* QR code data-URI — <Image> do next/image não otimiza esses casos */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={extractPixQrImage(prepaidChargeResult?.charge) || ''} alt="QR Code PIX" style={{ width: '100%', height: 'auto', display: 'block' }} />
              </div>
            ) : (
              <div style={{ background: 'rgba(10,31,48,0.8)', border: '1px solid rgba(0,200,224,0.12)', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', color: '#4A7A90', marginBottom: '14px' }}>
                QR code não disponível no retorno da Annapay.
              </div>
            )}

            {extractPixCopyPaste(prepaidChargeResult?.charge) ? (
              <div style={{ marginBottom: '14px' }}>
                <p style={{ fontSize: '11px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>PIX Copia e Cola</p>
                <textarea
                  readOnly
                  value={extractPixCopyPaste(prepaidChargeResult?.charge) || ''}
                  style={{ width: '100%', minHeight: '80px', background: '#050D15', border: '1px solid rgba(0,200,224,0.12)', borderRadius: '10px', padding: '10px 12px', fontSize: '12px', color: '#e2e8f0', resize: 'none', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
            ) : null}

            <p style={{ fontSize: '12px', color: '#4A7A90', marginBottom: '12px' }}>
              Escaneie o QR code para efetuar o pagamento. O sistema verificará automaticamente.
            </p>

            {chargeStatusMessage && (
              <div style={{ background: 'rgba(0,200,224,0.06)', border: '1px solid rgba(0,200,224,0.15)', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#94a3b8', marginBottom: '14px' }}>
                {chargeStatusMessage}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => registerPendingPrepaidTransaction({ closeModalOnStart: true })}
                disabled={registeringPendingPrepaid || !pendingPrepaidTransaction || autoProcessingPaidCharge}
                style={{ flex: 1, background: 'linear-gradient(135deg,#006070,#003848)', border: '1px solid rgba(0,200,224,0.4)', borderRadius: '10px', color: '#00C8E0', fontWeight: 700, fontSize: '14px', padding: '13px', cursor: (registeringPendingPrepaid || !pendingPrepaidTransaction || autoProcessingPaidCharge) ? 'not-allowed' : 'pointer', opacity: (registeringPendingPrepaid || !pendingPrepaidTransaction || autoProcessingPaidCharge) ? 0.6 : 1 }}
              >
                {registeringPendingPrepaid ? 'Registrando...' : 'Pagamento confirmado'}
              </button>
              <button
                type="button"
                onClick={() => setShowPrepaidModal(false)}
                disabled={registeringPendingPrepaid || autoProcessingPaidCharge || checkingChargeStatus}
                style={{ flex: 1, background: 'rgba(10,31,48,0.8)', border: '1px solid rgba(0,200,224,0.15)', borderRadius: '10px', color: '#94a3b8', fontWeight: 700, fontSize: '14px', padding: '13px', cursor: (registeringPendingPrepaid || autoProcessingPaidCharge || checkingChargeStatus) ? 'not-allowed' : 'pointer', opacity: (registeringPendingPrepaid || autoProcessingPaidCharge || checkingChargeStatus) ? 0.5 : 1 }}
              >
                {registeringPendingPrepaid ? 'Registrando...' : autoProcessingPaidCharge ? 'Processando...' : 'Fechar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
