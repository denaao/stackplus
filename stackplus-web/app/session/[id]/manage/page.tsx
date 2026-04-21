'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'
import { joinSession, leaveSession } from '@/services/socket'
import { getSocket } from '@/services/socket'
import { useAuthStore } from '@/store/useStore'
import AppHeader from '@/components/AppHeader'
import AppLoading from '@/components/AppLoading'
import { getStringByPaths } from '@/lib/payload'

type PdfFontWeight = 'normal' | 'bold'

interface Session {
  id: string; status: string; startedAt?: string
  rake?: string | number | null
  caixinha?: string | number | null
  caixinhaMode?: 'SPLIT' | 'INDIVIDUAL'
  caixinhaPerStaff?: number
  caixinhaDistribution?: Array<{ userId: string; name: string; amount: number; pixType?: string | null; pixKey?: string | null }>
  totalRakeback?: number
  rakebackDistribution?: Array<{ userId: string; name: string; percent: number; amount: number; pixType?: string | null; pixKey?: string | null }>
  pokerVariant?: 'HOLDEN' | 'BUTTON_CHOICE' | 'PINEAPPLE' | 'OMAHA' | 'OMAHA_FIVE' | 'OMAHA_SIX'
  gameType?: 'CASH_GAME' | 'TOURNAMENT'
  jackpotEnabled?: boolean
  homeGame: { id: string; name: string; chipValue: string; gameType?: 'CASH_GAME' | 'TOURNAMENT'; hostId: string; jackpotAccumulated?: string | number }
  cashier?: { id: string; name: string }
  playerStates: PlayerState[]
  staffAssignments: StaffAssignment[]
  rakebackAssignments: RakebackAssignment[]
  participantAssignments: ParticipantAssignment[]
}

interface StaffAssignment {
  userId: string
  caixinhaAmount?: number | string | null
  user: { id: string; name: string; email?: string; pixType?: string | null; pixKey?: string | null }
}

interface RakebackAssignment {
  userId: string
  percent?: number
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

interface SangeurMember {
  id: string
  user: { id: string; name: string; email?: string }
}

const pokerVariantLabels: Record<'HOLDEN' | 'BUTTON_CHOICE' | 'PINEAPPLE' | 'OMAHA' | 'OMAHA_FIVE' | 'OMAHA_SIX', string> = {
  HOLDEN: 'Holden',
  BUTTON_CHOICE: 'Button Choice',
  PINEAPPLE: 'Pineapple',
  OMAHA: 'Omaha',
  OMAHA_FIVE: 'Omaha Five',
  OMAHA_SIX: 'Omaha Six',
}

const rakebackStepOptions = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]

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
  charge?: unknown
  payoutOrder?: unknown
}

interface ReconciliationItem {
  chargeId: string
  flow: 'PREPAID_PURCHASE' | 'SESSION_SETTLEMENT'
  userId: string
  playerName: string
  amount: number
  settledAt: string
  matchStatus: 'FOUND' | 'NOT_FOUND'
  endToEndId: string | null
  matchedAt: string | null
}

interface FinancialReport {
  sessionId: string
  financialModule: 'POSTPAID' | 'PREPAID' | 'HYBRID'
  generatedAt: string
  summary: {
    chargesCreated: number
    chargesSkipped: number
    receivedPayments: number
    payoutsCreatedPendingApproval: number
    payoutsSkipped: number
  }
  charges: FinancialReportItem[]
  receivedPayments: Array<{ userId: string; name: string; amount: number; paidAt: string }>
  payouts: FinancialReportItem[]
  reconciliation?: {
    items: ReconciliationItem[]
    totalFound: number
    totalNotFound: number
    countFound: number
    countNotFound: number
  }
}

type FeedbackState = {
  tone: 'error' | 'success'
  message: string
} | null

function extractPixOrderId(payload: unknown): string | null {
  return getStringByPaths(payload, [
    ['id'],
    ['pixId'],
    ['orderId'],
    ['order_id'],
    ['data', 'id'],
    ['data', 'pixId'],
    ['response', 'id'],
    ['response', 'pixId'],
    ['result', 'id'],
  ])
}

function extractPixCopyPaste(payload: unknown): string | null {
  return getStringByPaths(payload, [
    ['pixCopyPaste'],
    ['pixCopiaECola'],
    ['copyPaste'],
    ['copiaECola'],
    ['pix', 'copiaECola'],
    ['charge', 'pixCopiaECola'],
    ['data', 'pixCopiaECola'],
  ])
}

function extractPayoutPixKey(payload: unknown): string | null {
  return getStringByPaths(payload, [
    ['destinatario', 'chave'],
    ['recipient', 'key'],
    ['chave'],
    ['pixKey'],
    ['data', 'destinatario', 'chave'],
    ['response', 'destinatario', 'chave'],
  ])
}

function formatCurrency(value: number) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

function formatFinancialModule(value: FinancialReport['financialModule']) {
  if (value === 'PREPAID') return 'Pré-pago'
  if (value === 'HYBRID') return 'Híbrido'
  return 'Pós-pago'
}

function parseMoneyValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null

  const normalized = value
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function extractBankBalance(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  const data = (obj.data && typeof obj.data === 'object') ? obj.data as Record<string, unknown> : {}
  const conta = (obj.conta && typeof obj.conta === 'object') ? obj.conta as Record<string, unknown> : {}

  const candidates = [
    obj.saldo,
    obj.balance,
    obj.availableBalance,
    obj.disponivel,
    obj.valor,
    data.saldo,
    data.balance,
    data.availableBalance,
    conta.saldo,
  ]

  for (const candidate of candidates) {
    const value = parseMoneyValue(candidate)
    if (value != null) return value
  }

  return null
}

function sanitizeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

export default function SessionManagePage() {
  const router = useRouter()
  const params = useParams()
  const sessionId = params.id as string
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showStaffModal, setShowStaffModal] = useState(false)
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([])
  const [selectedRakebackIds, setSelectedRakebackIds] = useState<string[]>([])
  const [selectedRakebackPercent, setSelectedRakebackPercent] = useState<Record<string, string>>({})
  const [activeRakebackIndex, setActiveRakebackIndex] = useState<number | null>(null)
  const [staffLoading, setStaffLoading] = useState(false)
  const [participantOptions, setParticipantOptions] = useState<ParticipantOption[]>([])
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([])
  const [participantsLoading, setParticipantsLoading] = useState(false)
  const [showParticipantsModal, setShowParticipantsModal] = useState(false)
  const [financialReport, setFinancialReport] = useState<FinancialReport | null>(null)
  const [financialLoading, setFinancialLoading] = useState(false)
  const [bankBalance, setBankBalance] = useState<number | null>(null)
  const [bankBalanceLoading, setBankBalanceLoading] = useState(false)
  const [bankBalanceError, setBankBalanceError] = useState<string | null>(null)
  const [approvingPixId, setApprovingPixId] = useState<string | null>(null)
  const [approvedPixIds, setApprovedPixIds] = useState<string[]>([])
  const [copiedChargeId, setCopiedChargeId] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pageFeedback, setPageFeedback] = useState<FeedbackState>(null)
  const [staffModalError, setStaffModalError] = useState<string | null>(null)
  const [selectedCaixinhaMode, setSelectedCaixinhaMode] = useState<'SPLIT' | 'INDIVIDUAL'>('SPLIT')
  const [participantsModalError, setParticipantsModalError] = useState<string | null>(null)
  const [showFinishConfirmModal, setShowFinishConfirmModal] = useState(false)
  const [showSangeurModal, setShowSangeurModal] = useState(false)
  const [sangeurAccesses, setSangeurAccesses] = useState<SangeurAccess[]>([])
  const [sangeurMembers, setSangeurMembers] = useState<SangeurMember[]>([])
  const [sangeurUserId, setSangeurUserId] = useState('')
  const [sangeurUsername, setSangeurUsername] = useState('')
  const [sangeurPassword, setSangeurPassword] = useState('')
  const [sangeurLoading, setSangeurLoading] = useState(false)
  const [sangeurActionUserId, setSangeurActionUserId] = useState<string | null>(null)
  const [sangeurError, setSangeurError] = useState<string | null>(null)
  const [sangeurIssuedCredential, setSangeurIssuedCredential] = useState<{ userName: string; username: string; temporaryPassword: string } | null>(null)
  const [sangeurCopied, setSangeurCopied] = useState<string | null>(null)

  async function copySangeur(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setSangeurCopied(key)
      setTimeout(() => setSangeurCopied((prev) => (prev === key ? null : prev)), 1500)
    } catch {
      setSangeurError('Não foi possível copiar para a área de transferência.')
    }
  }

  function normalizeSession(data: Session): Session {
    const distribution = Array.isArray(data.caixinhaDistribution) ? data.caixinhaDistribution : []
    return {
      ...data,
      playerStates: Array.isArray(data.playerStates) ? data.playerStates : [],
      staffAssignments: Array.isArray(data.staffAssignments) ? data.staffAssignments : [],
      rakebackAssignments: Array.isArray(data.rakebackAssignments)
        ? data.rakebackAssignments.map((assignment) => ({
            ...assignment,
            percent: Number(assignment.percent || 0),
          }))
        : [],
      participantAssignments: Array.isArray(data.participantAssignments) ? data.participantAssignments : [],
      caixinhaDistribution: distribution,
      caixinhaPerStaff: typeof data.caixinhaPerStaff === 'number' ? data.caixinhaPerStaff : 0,
      totalRakeback: typeof data.totalRakeback === 'number' ? data.totalRakeback : 0,
      rakebackDistribution: Array.isArray(data.rakebackDistribution) ? data.rakebackDistribution : [],
    }
  }

  useEffect(() => {
    api.get(`/sessions/${sessionId}`).then(({ data }) => {
      const normalized = normalizeSession(data)
      setSession(normalized)
      const homeGameId = normalized.homeGame?.id
      if (homeGameId) {
        api.get(`/home-games/${homeGameId}`).then((hg) => {
          setSangeurAccesses(hg.data.sangeurAccesses || [])
          setSangeurMembers(Array.isArray(hg.data.members) ? hg.data.members : [])
        }).catch(() => {})
      }
    }).finally(() => setLoading(false))

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

  function getErrorMessage(err: unknown, fallback: string) {
    return typeof err === 'string' ? err : fallback
  }

  async function startSession() {
    setPageFeedback(null)
    setActionLoading(true)
    try {
      const { data } = await api.patch(`/sessions/${sessionId}/start`, {})
      setSession(normalizeSession(data))
      setPageFeedback({ tone: 'success', message: 'Sessao iniciada com sucesso.' })
    } catch (err) {
      setPageFeedback({ tone: 'error', message: getErrorMessage(err, 'Nao foi possivel iniciar a sessao.') })
    } finally {
      setActionLoading(false)
    }
  }

  async function finishSession() {
    setPageFeedback(null)
    setActionLoading(true)
    try {
      await api.patch(`/sessions/${sessionId}/finish`, {})
      router.back()
    } catch (err) {
      setPageFeedback({ tone: 'error', message: getErrorMessage(err, 'Nao foi possivel finalizar a sessao.') })
    } finally {
      setActionLoading(false)
      setShowFinishConfirmModal(false)
    }
  }

  function applySangeurAccess(access: SangeurAccess) {
    setSangeurAccesses((prev) => {
      const idx = prev.findIndex((item) => item.userId === access.userId)
      if (idx === -1) return [access, ...prev]
      const clone = [...prev]
      clone[idx] = access
      return clone
    })
  }

  async function openSangeurModal() {
    if (!session) return
    setSangeurError(null)
    setSangeurIssuedCredential(null)
    setSangeurUserId('')
    setSangeurUsername('')
    setSangeurPassword('')
    setSangeurLoading(true)
    try {
      const { data } = await api.get(`/home-games/${session.homeGame.id}`)
      setSangeurAccesses(data.sangeurAccesses || [])
      setSangeurMembers(Array.isArray(data.members) ? data.members : [])
      setShowSangeurModal(true)
    } catch (err) {
      setPageFeedback({ tone: 'error', message: getErrorMessage(err, 'Nao foi possivel carregar dados do SANGEUR.') })
    } finally {
      setSangeurLoading(false)
    }
  }

  function closeSangeurModal() {
    setShowSangeurModal(false)
    setSangeurError(null)
    setSangeurIssuedCredential(null)
  }

  async function handleEnableSangeur() {
    if (!session) return
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

      const { data } = await api.post(`/home-games/${session.homeGame.id}/sangeurs`, payload)
      applySangeurAccess(data.access)
      setSangeurIssuedCredential({
        userName: data.access.user.name,
        username: data.access.username,
        temporaryPassword: data.temporaryPassword,
      })
      setSangeurPassword('')
      setSangeurUserId('')
      setSangeurUsername('')
      setPageFeedback({ tone: 'success', message: 'SANGEUR habilitada com sucesso.' })
    } catch (err) {
      setSangeurError(getErrorMessage(err, 'Nao foi possivel habilitar a SANGEUR.'))
    } finally {
      setSangeurLoading(false)
    }
  }

  async function handleDisableSangeur(userId: string) {
    if (!session) return
    setSangeurActionUserId(userId)
    setSangeurError(null)
    try {
      const { data } = await api.patch(`/home-games/${session.homeGame.id}/sangeurs/${userId}/disable`)
      applySangeurAccess(data)
      setPageFeedback({ tone: 'success', message: 'Acesso de SANGEUR desabilitado.' })
    } catch (err) {
      setSangeurError(getErrorMessage(err, 'Nao foi possivel desabilitar a SANGEUR.'))
    } finally {
      setSangeurActionUserId(null)
    }
  }

  async function handleResetSangeurPassword(userId: string) {
    if (!session) return
    setSangeurActionUserId(userId)
    setSangeurError(null)
    try {
      const { data } = await api.patch(`/home-games/${session.homeGame.id}/sangeurs/${userId}/reset-password`, {})
      applySangeurAccess(data.access)
      setSangeurIssuedCredential({
        userName: data.access.user.name,
        username: data.access.username,
        temporaryPassword: data.temporaryPassword,
      })
      setPageFeedback({ tone: 'success', message: 'Senha temporaria da SANGEUR redefinida.' })
    } catch (err) {
      setSangeurError(getErrorMessage(err, 'Nao foi possivel redefinir a senha da SANGEUR.'))
    } finally {
      setSangeurActionUserId(null)
    }
  }

  async function openStaffModal() {
    setStaffModalError(null)
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
      setSelectedCaixinhaMode(normalized.caixinhaMode === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'SPLIT')
      setSelectedRakebackIds(normalized.rakebackAssignments.map((assignment) => assignment.userId))
      setSelectedRakebackPercent(normalized.rakebackAssignments.reduce<Record<string, string>>((acc, assignment) => {
        acc[assignment.userId] = String(Number(assignment.percent || 0))
        return acc
      }, {}))
      setActiveRakebackIndex(normalized.rakebackAssignments.length > 0 ? 0 : null)
      setShowStaffModal(true)
    } catch (err) {
      setPageFeedback({ tone: 'error', message: getErrorMessage(err, 'Nao foi possivel carregar o staff.') })
    } finally {
      setStaffLoading(false)
    }
  }

  async function saveStaff() {
    const rakebackPayload = selectedRakebackIds.map((userId) => ({
      userId,
      percent: Number(selectedRakebackPercent[userId] || 0),
    }))
    const totalRakebackPercent = rakebackPayload.reduce((sum, item) => sum + (Number.isFinite(item.percent) ? item.percent : 0), 0)
    if (totalRakebackPercent > 100) {
      setStaffModalError('A soma do rakeback do staff nao pode passar de 100%.')
      return
    }

    setStaffModalError(null)
    setPageFeedback(null)
    setStaffLoading(true)
    try {
      await api.put(`/sessions/${sessionId}/staff`, { userIds: selectedStaffIds, caixinhaMode: selectedCaixinhaMode })
      const { data } = await api.put(`/sessions/${sessionId}/rakeback`, { assignments: rakebackPayload })
      setSession(normalizeSession(data))
      setShowStaffModal(false)
      setActiveRakebackIndex(null)
      setPageFeedback({ tone: 'success', message: 'Staff da partida salvo com sucesso.' })
    } catch (err) {
      setStaffModalError(getErrorMessage(err, 'Nao foi possivel salvar o staff.'))
    } finally {
      setStaffLoading(false)
    }
  }

  async function openParticipantsModal() {
    setParticipantsModalError(null)
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
      setShowParticipantsModal(true)
    } catch (err) {
      setPageFeedback({ tone: 'error', message: getErrorMessage(err, 'Nao foi possivel carregar participantes da partida.') })
    } finally {
      setParticipantsLoading(false)
    }
  }

  async function saveParticipants() {
    setParticipantsModalError(null)
    setPageFeedback(null)
    setParticipantsLoading(true)
    try {
      const { data } = await api.put(`/sessions/${sessionId}/participants`, { userIds: selectedParticipantIds })
      setSession(normalizeSession(data))
      setShowParticipantsModal(false)
      setPageFeedback({ tone: 'success', message: 'Participantes salvos com sucesso.' })
    } catch (err) {
      setParticipantsModalError(getErrorMessage(err, 'Nao foi possivel salvar participantes.'))
    } finally {
      setParticipantsLoading(false)
    }
  }

  async function generateFinancialReport() {
    setPageFeedback(null)
    setFinancialLoading(true)
    try {
      const { data } = await api.post(`/banking/annapay/sessions/${sessionId}/financial-report`, {})
      setFinancialReport(data)
      setApprovedPixIds([])
      setPageFeedback({ tone: 'success', message: 'Relatorio financeiro gerado com sucesso.' })
    } catch (err) {
      setPageFeedback({ tone: 'error', message: getErrorMessage(err, 'Nao foi possivel gerar o relatorio financeiro.') })
    } finally {
      setFinancialLoading(false)
    }
  }

  async function loadBankBalance() {
    setBankBalanceLoading(true)
    setBankBalanceError(null)
    try {
      const { data } = await api.get('/banking/annapay/balance')
      const parsed = extractBankBalance(data)
      setBankBalance(parsed)
      if (parsed == null) {
        setBankBalanceError('Saldo indisponível no retorno da conta')
      }
    } catch (err) {
      setBankBalanceError(typeof err === 'string' ? err : 'Não foi possível carregar saldo bancário')
    } finally {
      setBankBalanceLoading(false)
    }
  }

  async function approvePixOrder(orderId: string) {
    setPageFeedback(null)
    setApprovingPixId(orderId)
    try {
      await api.put(`/banking/annapay/pix/${orderId}`, {})
      setApprovedPixIds((prev) => prev.includes(orderId) ? prev : [...prev, orderId])
      setPageFeedback({ tone: 'success', message: 'Ordem PIX aprovada com sucesso.' })
    } catch (err) {
      setPageFeedback({ tone: 'error', message: getErrorMessage(err, 'Nao foi possivel aprovar a ordem PIX.') })
    } finally {
      setApprovingPixId(null)
    }
  }

  async function downloadFinancialReportPdf() {
    if (!session || !financialReport) return

    setPdfLoading(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 40
      const maxWidth = pageWidth - (margin * 2)
      let y = 40

      const ensureSpace = (needed = 18) => {
        if (y + needed <= pageHeight - margin) return
        doc.addPage()
        y = 40
      }

      const addText = (text: string, options?: { size?: number; color?: [number, number, number]; gap?: number; weight?: PdfFontWeight }) => {
        const size = options?.size ?? 11
        const color = options?.color ?? [24, 24, 27]
        const gap = options?.gap ?? 8
        const weight = options?.weight ?? 'normal'
        const lines = doc.splitTextToSize(text, maxWidth)
        doc.setFont('helvetica', weight)
        doc.setFontSize(size)
        doc.setTextColor(color[0], color[1], color[2])

        lines.forEach((line: string) => {
          ensureSpace(size + 8)
          doc.text(line, margin, y)
          y += size + 4
        })

        y += gap
      }

      const addSection = (title: string) => {
        y += 4
        addText(title, { size: 14, color: [88, 28, 135], gap: 4, weight: 'bold' })
        ensureSpace(12)
        doc.setDrawColor(216, 180, 254)
        doc.line(margin, y - 2, pageWidth - margin, y - 2)
        y += 10
      }

      addText('Relatório de Liquidação Financeira', { size: 20, color: [17, 24, 39], gap: 2, weight: 'bold' })
      addText(`${session.homeGame.name} • Sessão ${session.id}`, { size: 11, color: [82, 82, 91], gap: 10 })

      addSection('Resumo da Sessão')
      addText(`Home game: ${session.homeGame.name}`)
      addText(`Sessão: ${session.id}`)
      addText(`Modalidade: ${gameType === 'CASH_GAME' ? 'Cash Game' : 'Torneio'}`)
      addText(`Variante: ${pokerVariantLabels[pokerVariant]}`)
      addText(`Status: ${session.status}`)
      addText(`Início: ${formatDateTime(session.startedAt)}`)
      addText(`Encerramento: ${formatDateTime((session as Session & { finishedAt?: string }).finishedAt)}`)
      addText(`Valor da ficha: ${formatCurrency(Number(session.homeGame.chipValue || 0))}`)

      addSection('Resumo Financeiro')
      addText(`Módulo financeiro: ${formatFinancialModule(financialReport.financialModule)}`)
      addText(`Gerado em: ${formatDateTime(financialReport.generatedAt)}`)
      addText(`Cobranças geradas: ${financialReport.summary.chargesCreated}`)
      addText(`Cobranças com pendência manual: ${financialReport.summary.chargesSkipped}`)
      addText(`Pagamentos recebidos: ${financialReport.summary.receivedPayments}`)
      addText(`Ordens PIX aprovadas: ${approvedPixIds.length} de ${financialReport.summary.payoutsCreatedPendingApproval}`)
      addText(`Ordens PIX com pendência manual: ${financialReport.summary.payoutsSkipped}`)

      addSection('Ranking Final')
      if (sortedPlayers.length === 0) {
        addText('Nenhum jogador registrado na sessão.')
      } else {
        sortedPlayers.forEach((player, index) => {
          addText(`${index + 1}. ${player.user.name} • Resultado: ${formatCurrency(Number(player.result))} • Buy-in: ${formatCurrency(Number(player.chipsIn))} • Cashout: ${formatCurrency(Number(player.chipsOut))}${player.hasCashedOut ? ' • Cashout registrado' : ''}`)
        })
      }

      addSection('Pagamentos Recebidos Pelo Host')
      if (financialReport.receivedPayments.length === 0) {
        addText('Nenhum pagamento recebido identificado até o momento.')
      } else {
        financialReport.receivedPayments.forEach((item) => {
          addText(`${item.name} • ${formatCurrency(Number(item.amount))}`, { weight: 'bold', gap: 2 })
          addText(`Recebido em: ${formatDateTime(item.paidAt)}`, { gap: 2 })
        })
      }

      addSection('Liquidação Líquida por Jogador')
      const netByUser = new Map<string, {
        userId: string
        name: string
        amount: number
        kind: 'RECEIVE_FROM_HOST' | 'PAY_HOST'
        skippedReason?: string
        pixCopyPaste?: string | null
        pixKey?: string | null
        orderId?: string | null
        approved?: boolean
      }>()

      for (const charge of financialReport.charges) {
        netByUser.set(charge.userId, {
          userId: charge.userId,
          name: charge.name,
          amount: Number(charge.amount),
          kind: 'PAY_HOST',
          skippedReason: charge.skippedReason,
          pixCopyPaste: extractPixCopyPaste(charge.charge),
        })
      }

      for (const payout of financialReport.payouts) {
        const orderId = extractPixOrderId(payout.payoutOrder)
        netByUser.set(payout.userId, {
          userId: payout.userId,
          name: payout.name,
          amount: Number(payout.amount),
          kind: 'RECEIVE_FROM_HOST',
          skippedReason: payout.skippedReason,
          pixKey: extractPayoutPixKey(payout.payoutOrder),
          orderId,
          approved: orderId ? approvedPixIds.includes(orderId) : false,
        })
      }

      const netItems = Array.from(netByUser.values())
      if (netItems.length === 0) {
        addText('Nenhuma liquidação pendente para jogadores.')
      } else {
        netItems.forEach((item) => {
          const signedAmount = item.kind === 'RECEIVE_FROM_HOST'
            ? `+${formatCurrency(item.amount)}`
            : `-${formatCurrency(item.amount)}`
          const direction = item.kind === 'RECEIVE_FROM_HOST'
            ? 'Deve receber do host'
            : 'Deve pagar ao host'

          addText(`${item.name} • ${signedAmount}`, { weight: 'bold', gap: 2 })
          addText(direction, { gap: 2 })

          if (item.pixCopyPaste) {
            addText(`PIX copia e cola: ${item.pixCopyPaste}`, { gap: 2 })
          }
          if (item.pixKey) {
            addText(`Chave PIX: ${item.pixKey}`, { gap: 2 })
          }
          if (item.orderId) {
            addText(`Ordem PIX: ${item.orderId}`, { gap: 2 })
          }

          if (item.skippedReason) {
            addText(`Pendência: ${item.skippedReason}`, { color: [153, 27, 27] })
          } else if (item.kind === 'RECEIVE_FROM_HOST') {
            addText(`Status: ${item.approved ? 'PIX enviado pelo host' : 'Aguardando envio do host'}`, {
              color: item.approved ? [22, 101, 52] : [161, 98, 7],
            })
          } else {
            addText('Status: cobrança PIX gerada para pagamento ao host.', { color: [22, 101, 52], gap: 2 })
          }
        })
      }

      if (sessionCaixinha > 0) {
        addSection('Divisão da Caixinha')
        addText(`Total da caixinha: ${formatCurrency(sessionCaixinha)}`)
        if (staffCaixinhaWinners.length === 0) {
          addText('Nenhum staff configurado para divisão.')
        } else {
          staffCaixinhaWinners.forEach((item) => {
            addText(`${item.name} • ${formatCurrency(Number(item.amount))}${item.pixKey ? ` • PIX ${item.pixType ? `(${item.pixType}) ` : ''}${item.pixKey}` : ''}`)
          })
        }
      }

      const fileName = `liquidacao-${sanitizeFileName(session.homeGame.name)}-${session.id.slice(0, 8)}.pdf`
      doc.save(fileName)
    } catch (err) {
      setPageFeedback({ tone: 'error', message: getErrorMessage(err, 'Nao foi possivel gerar o PDF da liquidacao financeira.') })
    } finally {
      setPdfLoading(false)
    }
  }

  useEffect(() => {
    if (!session) return
    const currentIsHost = user?.id === session.homeGame.hostId
    if (!currentIsHost || session.status !== 'FINISHED') return
    loadBankBalance()
    // loadBankBalance é estavel o suficiente pra nao incluir na dep — executar
    // uma vez por (sessionId, status, userId) é o comportamento desejado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.status, session?.homeGame?.hostId, user?.id])

  if (loading) return <AppLoading />
  if (!session) return null

  const gameType = session.gameType || session.homeGame.gameType || 'CASH_GAME'
  const pokerVariant = session.pokerVariant || 'HOLDEN'
  const isHost = user?.id === session.homeGame.hostId
  const hasSavedParticipants = session.participantAssignments.length > 0
  const canStartSession = gameType !== 'CASH_GAME' || session.participantAssignments.length >= 2
  const sessionCaixinha = Number(session.caixinha || 0)
  const sessionRake = Number(session.rake || 0)
  const hasDistribution = Array.isArray(session.caixinhaDistribution) && session.caixinhaDistribution.length > 0
  const hasRakebackDistribution = Array.isArray(session.rakebackDistribution) && session.rakebackDistribution.length > 0
  const fallbackCaixinhaPerStaff = session.staffAssignments.length > 0
    ? Number((sessionCaixinha / session.staffAssignments.length).toFixed(2))
    : 0
  const staffRakebackWinners = hasRakebackDistribution
    ? session.rakebackDistribution || []
    : (session.rakebackAssignments || [])
      .filter((assignment) => Number(assignment.percent || 0) > 0)
      .map((assignment) => ({
        userId: assignment.userId,
        name: assignment.user.name,
        percent: Number(assignment.percent || 0),
        amount: Number((sessionRake * Number(assignment.percent || 0) / 100).toFixed(2)),
        pixType: assignment.user.pixType || null,
        pixKey: assignment.user.pixKey || null,
      }))
  const selectedStaffTotalPercent = selectedRakebackIds.reduce((sum, userId) => {
    const value = Number(selectedRakebackPercent[userId] || 0)
    if (!Number.isFinite(value) || value < 0) return sum
    return sum + value
  }, 0)
  const remainingRakebackPercent = Math.max(0, Number((100 - selectedStaffTotalPercent).toFixed(2)))
  const staffCaixinhaWinners = hasDistribution
    ? session.caixinhaDistribution || []
    : (session.staffAssignments || []).map((assignment) => ({
      userId: assignment.userId,
      name: assignment.user.name,
      amount: fallbackCaixinhaPerStaff,
      pixType: assignment.user.pixType || null,
      pixKey: assignment.user.pixKey || null,
    }))
  const homeGameJackpotValue = Number(session.homeGame.jackpotAccumulated || 0)
  const sortedPlayers = [...(session.playerStates || [])].sort((a, b) => parseFloat(b.result) - parseFloat(a.result))
  const financialHasSkippedItems = financialReport
    ? [...financialReport.charges, ...financialReport.payouts].some((item) => Boolean(item.skippedReason))
    : true
  const financialHasPendingPayoutApproval = financialReport
    ? financialReport.payouts.some((item) => {
        if (item.skippedReason) return true
        const orderId = extractPixOrderId(item.payoutOrder)
        return !orderId || !approvedPixIds.includes(orderId)
      })
    : true
  const canDownloadFinancialPdf = Boolean(financialReport) && !financialHasSkippedItems && !financialHasPendingPayoutApproval

  return (
    <div className="min-h-screen bg-sx-bg">
      <AppHeader
        title={session.homeGame.name}
        onBack={() => router.back()}
        userName={user?.name}
        onLogout={() => { logout(); router.push('/') }}
        rightSlot={session.status === 'ACTIVE' ? (
          <div className="flex gap-2">
            {gameType === 'TOURNAMENT' && (
              <button onClick={() => window.open(`/tv/${sessionId}`, '_blank')}
                className="bg-sx-border2 hover:bg-sx-border2 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors">
                📺 TV
              </button>
            )}
            <button onClick={() => setShowFinishConfirmModal(true)} disabled={actionLoading}
              className="bg-red-500 hover:bg-red-400 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
              Finalizar
            </button>
          </div>
        ) : undefined}
      />

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {pageFeedback && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${pageFeedback.tone === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-sx-cyan/30 bg-sx-cyan/10 text-sx-cyan'}`}>
            {pageFeedback.message}
          </div>
        )}

        {isHost && session.status !== 'FINISHED' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(0,200,224,0.12)' }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-blue-300">Staff da partida</p>
                  <p className="mt-1 text-sm text-zinc-400">{session.status === 'WAITING' ? 'Selecione quem faz parte do staff e configure o rakeback.' : 'Gerencie o staff durante a partida.'}</p>
                </div>
                <button
                  type="button"
                  onClick={openStaffModal}
                  disabled={staffLoading}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {staffLoading ? 'Carregando...' : `Configurar Staff${session.staffAssignments.length ? ` (${session.staffAssignments.length})` : ''}`}
                </button>
              </div>
              {session.staffAssignments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {session.staffAssignments.map((assignment) => (
                    <span key={assignment.userId} className="rounded-full bg-blue-500/20 border border-blue-500/30 px-3 py-1 text-xs font-medium text-blue-200">
                      {assignment.user.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(0,200,224,0.2)' }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-sx-cyan">SANGEUR</p>
                  <p className="mt-1 text-sm text-zinc-400">Gerencie acessos ao caixa móvel da partida.</p>
                </div>
                <button
                  type="button"
                  onClick={openSangeurModal}
                  disabled={sangeurLoading}
                  className="rounded-lg bg-sx-cyan px-3 py-2 text-xs font-bold text-sx-bg hover:bg-sx-cyan-dim disabled:opacity-50"
                >
                  {sangeurLoading && !showSangeurModal ? 'Carregando...' : `Gerenciar SANGEUR${sangeurAccesses.filter((a) => a.isActive).length ? ` (${sangeurAccesses.filter((a) => a.isActive).length})` : ''}`}
                </button>
              </div>
              {sangeurAccesses.filter((a) => a.isActive).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {sangeurAccesses.filter((a) => a.isActive).map((access) => (
                    <span key={access.id} className="rounded-full bg-sx-cyan/15 border border-sx-cyan/30 px-3 py-1 text-xs font-medium text-sx-cyan/70">
                      {access.user.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {gameType === 'CASH_GAME' && isHost && session.status !== 'FINISHED' && (
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(0,200,224,0.12)' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-sx-muted">Participantes da partida</p>
                <p className="mt-1 text-sm text-zinc-300">Escolha quem do home game vai participar desta sessão de cash game.</p>
              </div>
              <button
                type="button"
                onClick={openParticipantsModal}
                disabled={participantsLoading}
                className="rounded-lg bg-sx-cyan px-3 py-2 text-xs font-bold text-sx-bg hover:bg-sx-cyan-dim disabled:opacity-50"
              >
                {participantsLoading ? 'Carregando...' : `Escolher participantes${session.participantAssignments.length ? ` (${session.participantAssignments.length})` : ''}`}
              </button>
            </div>

            {hasSavedParticipants && (
              <div className="mt-3 flex flex-wrap gap-2">
                {session.participantAssignments.map((assignment) => (
                  <span key={assignment.userId} className="rounded-full border border-sx-cyan/40 bg-sx-cyan/10 px-3 py-1 text-xs font-medium text-sx-cyan/80">
                    {assignment.user.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {showParticipantsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}>
            <div className="w-full max-w-2xl rounded-2xl p-6" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(0,200,224,0.15)' }}>
              <h3 className="text-lg font-bold text-white">Participantes da Partida</h3>
              <p className="mt-1 text-sm text-sx-muted">Selecione os jogadores que vão participar desta sessão.</p>

              {participantsModalError && (
                <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {participantsModalError}
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedParticipantIds(participantOptions.map((person) => person.id))}
                  disabled={participantsLoading || participantOptions.length === 0}
                  className="min-w-[128px] rounded-lg border border-sx-border2 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-sx-input disabled:opacity-50"
                >
                  Selecionar todos
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedParticipantIds([])}
                  disabled={participantsLoading}
                  className="min-w-[128px] rounded-lg border border-sx-border2 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-sx-input disabled:opacity-50"
                >
                  Limpar
                </button>
              </div>

              <div className="mt-4 grid max-h-[45vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {participantOptions.map((person) => {
                  const checked = selectedParticipantIds.includes(person.id)
                  return (
                    <button
                      type="button"
                      key={person.id}
                      onClick={() => {
                        setSelectedParticipantIds((prev) => checked ? prev.filter((id) => id !== person.id) : [...prev, person.id])
                      }}
                      className={`rounded-lg border-2 p-3 text-left transition-all ${checked ? 'border-sx-cyan bg-sx-cyan/15' : 'border-sx-border2 bg-sx-input/50 hover:border-sx-border2'}`}
                    >
                      <p className={`text-sm font-medium ${checked ? 'text-sx-cyan' : 'text-zinc-100'}`}>{person.name}</p>
                    </button>
                  )
                })}
                {participantOptions.length === 0 && (
                  <p className="text-sm text-sx-muted">Nenhuma pessoa cadastrada no home game.</p>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowParticipantsModal(false)}
                  className="rounded-lg border border-sx-border2 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-sx-input transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveParticipants}
                  disabled={participantsLoading}
                  className="rounded-lg bg-sx-cyan px-4 py-2 text-sm font-bold text-sx-bg hover:bg-sx-cyan-dim disabled:opacity-50 transition-colors"
                >
                  {participantsLoading ? 'Salvando...' : 'Salvar participantes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {gameType === 'CASH_GAME' && session.status === 'ACTIVE' && (
          <div>
            <button
              onClick={() => router.push(`/cashier/${sessionId}`)}
              disabled={!hasSavedParticipants}
              className="w-full bg-sx-cyan hover:bg-sx-cyan-dim text-sx-bg font-bold px-4 py-3 rounded-xl text-base transition-colors disabled:opacity-50"
            >
              {hasSavedParticipants ? 'Ir para o Caixa' : 'Salve os participantes para liberar o Caixa'}
            </button>
          </div>
        )}

        {session.status === 'FINISHED' && isHost && (
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(0,200,224,0.25)' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-sx-cyan">Liquidação</p>
                <p className="mt-1 text-sm text-zinc-300">Saldos, cobranças PIX e pagamentos agora são gerenciados pela comanda de cada jogador.</p>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/homegame/${session.homeGame.id}/comandas`)}
                className="rounded-lg bg-sx-cyan px-4 py-2 text-sm font-bold text-sx-bg hover:bg-sx-cyan-dim transition-colors whitespace-nowrap"
              >
                Ir para comandas
              </button>
            </div>
          </div>
        )}
        {gameType === 'TOURNAMENT' && (
          <div className="rounded-2xl p-4 text-sm text-amber-200" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(245,158,11,0.25)' }}>
            A modalidade torneio ja esta separada no sistema, mas o fluxo operacional especifico de torneio ainda nao foi implementado. Por isso, o caixa de cash game fica desativado aqui.
          </div>
        )}

        {session.status === 'WAITING' && isHost && (
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(0,200,224,0.25)' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-sx-cyan">Inicio da partida</p>
                <p className="mt-1 text-sm text-zinc-300">Inicie a sessao apos finalizar as configuracoes de participantes e staff.</p>
              </div>
              <button
                onClick={startSession}
                disabled={actionLoading || !canStartSession}
                className="rounded-lg bg-sx-cyan px-4 py-2 text-sm font-bold text-sx-bg transition-colors hover:bg-sx-cyan-dim disabled:opacity-50"
              >
                {!canStartSession ? 'Min. 2 participantes' : 'Iniciar'}
              </button>
            </div>
          </div>
        )}

        {session.jackpotEnabled !== false && (
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(0,200,224,0.25)' }}>
            <p className="text-xs uppercase tracking-wide text-sx-cyan/80">Novo valor do JACKPOT do Home Game</p>
            <p className="mt-1 text-2xl font-black text-sx-cyan">{formatCurrency(homeGameJackpotValue)}</p>
            <p className="mt-1 text-xs text-sx-cyan/80">Este valor será usado como JACKPOT atual para as próximas partidas deste Home Game.</p>
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-white/40 font-medium">Ranking em Tempo Real</h2>
          {sortedPlayers.length === 0 ? (
            <div className="text-center py-12 text-sx-muted border border-dashed border-sx-border rounded-2xl">
              {gameType === 'CASH_GAME' ? 'Aguardando buy-ins...' : 'Aguardando jogadores...'}
            </div>
          ) : (
            sortedPlayers.map((p, i) => {
              const result = parseFloat(p.result)
              const isPositive = result > 0
              const isNegative = result < 0
              const accentColor = isPositive ? 'rgba(0,200,224,0.7)' : isNegative ? 'rgba(239,68,68,0.7)' : 'rgba(0,200,224,0.3)'
              return (
                <div key={p.userId} style={{
                  background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)',
                  border: `1px solid rgba(0,200,224,0.10)`,
                  borderLeft: `3px solid ${accentColor}`,
                  borderRadius: 16,
                }} className="p-4 flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${i === 0 ? 'bg-sx-cyan text-sx-bg' : i === 1 ? 'bg-zinc-400 text-sx-bg' : i === 2 ? 'bg-amber-600 text-white' : 'bg-sx-input text-sx-muted'}`}>
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">{p.user.name}</p>
                    <p className="text-xs text-sx-muted">Stack: {parseFloat(p.currentStack).toLocaleString()} fichas</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold tabular-nums ${isPositive ? 'text-sx-cyan' : isNegative ? 'text-red-400' : 'text-sx-muted'}`}>
                      {isPositive ? '+' : ''}R$ {result.toFixed(2)}
                    </p>
                    <p className="text-xs text-sx-muted">Inv: R$ {parseFloat(p.chipsIn).toFixed(2)}</p>
                    {p.hasCashedOut && (
                      <p className="text-xs text-sx-muted">Cashout: R$ {parseFloat(p.chipsOut).toFixed(2)}</p>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {session.staffAssignments.length > 0 && (
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(59,130,246,0.2)' }}>
            <p className="text-xs uppercase tracking-wide text-blue-300">Staff da partida</p>
            <p className="mt-2 text-sm text-zinc-200">{session.staffAssignments.map((assignment) => assignment.user.name).join(', ')}</p>
          </div>
        )}
        {session.status === 'FINISHED' && sessionRake > 0 && (
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <p className="text-xs uppercase tracking-wide text-amber-300">Divisão do Rakeback</p>
            <p className="mt-1 text-sm text-zinc-200">Rake registrado: R$ {sessionRake.toFixed(2)}</p>
            <p className="mt-1 text-sm text-zinc-300">Total de rakeback distribuído: R$ {Number(session.totalRakeback || 0).toFixed(2)}</p>
            {staffRakebackWinners.length > 0 ? (
              <div className="mt-3 space-y-2">
                {staffRakebackWinners.map((item) => (
                  <div key={item.userId} className="flex items-center justify-between rounded-xl border border-amber-500/15 bg-black/20 px-3 py-2 text-sm">
                    <div>
                      <span className="text-zinc-100">{item.name}</span>
                      <p className="text-xs text-sx-muted">{Number(item.percent).toFixed(2)}% do rake</p>
                    </div>
                    <span className="font-semibold text-amber-300">R$ {Number(item.amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-sx-muted">Não há rakeback configurado para esta sessão.</p>
            )}
          </div>
        )}
        {session.status === 'FINISHED' && sessionCaixinha > 0 && (
          <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(0,200,224,0.2)' }}>
            <p className="text-xs uppercase tracking-wide text-sx-cyan">Divisão da Caixinha</p>
            <p className="mt-1 text-sm text-zinc-200">Total registrado: R$ {sessionCaixinha.toFixed(2)}</p>
            {staffCaixinhaWinners.length > 0 ? (
              <div className="mt-3 space-y-2">
                {staffCaixinhaWinners.map((item) => (
                  <div key={item.userId} className="flex items-center justify-between rounded-xl border border-sx-cyan/15 bg-black/20 px-3 py-2 text-sm">
                    <div>
                      <span className="text-zinc-100">{item.name}</span>
                      {item.pixKey && <p className="text-xs text-sx-muted">PIX{item.pixType ? ` (${item.pixType})` : ''}: {item.pixKey}</p>}
                    </div>
                    <span className="font-semibold text-green-400">R$ {Number(item.amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-sx-muted">Não há staff selecionado para esta sessão.</p>
            )}
          </div>
        )}
      </main>

      {showStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-2xl rounded-2xl p-6" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(0,200,224,0.15)' }}>
            <h3 className="text-lg font-bold text-white">Staff da Partida</h3>
            <p className="mt-1 text-sm text-sx-muted">Selecione quem faz parte do staff e configure o rakeback.</p>

            {staffModalError && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {staffModalError}
              </div>
            )}

            <p className="mt-6 text-xs uppercase tracking-widest text-white/40">Staff</p>
            <div className="mt-3 grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
              {staffOptions.map((person) => {
                const checked = selectedStaffIds.includes(person.id)
                return (
                  <button
                    type="button"
                    key={`staff-${person.id}`}
                    onClick={() => {
                      setSelectedStaffIds((prev) => checked ? prev.filter((id) => id !== person.id) : [...prev, person.id])
                    }}
                    className={`rounded-lg border-2 p-2.5 text-left transition-all ${checked ? 'border-sx-cyan bg-sx-cyan/15' : 'border-sx-border2 bg-sx-input/50 hover:border-sx-border2'}`}
                  >
                    <p className={`text-sm font-medium ${checked ? 'text-sx-cyan' : 'text-zinc-100'}`}>{person.name}</p>
                  </button>
                )
              })}
            </div>

            {selectedStaffIds.length > 0 && (
              <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3">
                <p className="text-xs uppercase tracking-widest text-white/40 mb-2">Caixinha</p>
                <p className="text-sm text-zinc-300 mb-3">A caixinha vai ser dividida em partes iguais entre o staff ou cada um recebe um valor individual?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCaixinhaMode('SPLIT')}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${
                      selectedCaixinhaMode === 'SPLIT'
                        ? 'border-sx-cyan bg-sx-cyan/15 text-sx-cyan'
                        : 'border-sx-border2 bg-sx-card text-zinc-300 hover:bg-sx-input'
                    }`}
                  >
                    Dividir em partes iguais
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCaixinhaMode('INDIVIDUAL')}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${
                      selectedCaixinhaMode === 'INDIVIDUAL'
                        ? 'border-sx-cyan bg-sx-cyan/15 text-sx-cyan'
                        : 'border-sx-border2 bg-sx-card text-zinc-300 hover:bg-sx-input'
                    }`}
                  >
                    Individual por staff
                  </button>
                </div>
                <p className="mt-2 text-xs text-sx-muted">
                  {selectedCaixinhaMode === 'SPLIT'
                    ? 'Ao encerrar a partida, o host lança o valor total e o sistema divide igualmente.'
                    : 'Ao encerrar a partida, o host lança o valor individual de cada staff.'}
                </p>
              </div>
            )}

            <p className="mt-6 text-xs uppercase tracking-widest text-white/40">Rakeback (% do rake)</p>
            <div className="mt-3 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {staffOptions.map((person) => {
                const checked = selectedRakebackIds.includes(person.id)
                const currentPercent = Number(selectedRakebackPercent[person.id] || 0)

                return (
                  <button
                    type="button"
                    key={`rakeback-toggle-${person.id}`}
                    onClick={() => {
                      setSelectedRakebackIds((prev) => {
                        if (checked) {
                          const removedIndex = prev.indexOf(person.id)
                          const next = prev.filter((id) => id !== person.id)
                          setActiveRakebackIndex((current) => {
                            if (next.length === 0) return null
                            if (current == null) return null
                            if (removedIndex === -1) return current
                            if (current > removedIndex) return current - 1
                            if (current === removedIndex) return Math.min(removedIndex, next.length - 1)
                            return current
                          })
                          return next
                        }

                        const next = [...prev, person.id]
                        setSelectedRakebackPercent((current) => {
                          if (current[person.id] != null) return current
                          return { ...current, [person.id]: '0' }
                        })
                        setActiveRakebackIndex((current) => current == null ? next.length - 1 : current)
                        return next
                      })
                    }}
                    className={`rounded-lg border-2 p-2.5 text-left transition-all ${checked ? 'border-sx-cyan bg-sx-cyan/15' : 'border-sx-border2 bg-sx-input/50 hover:border-sx-border2'}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <p className={`text-sm font-medium ${checked ? 'text-sx-cyan' : 'text-zinc-100'}`}>{person.name}</p>
                      {checked && <span className="text-xs font-semibold text-sx-cyan">{currentPercent.toFixed(0)}%</span>}
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="mt-4 space-y-2">
              {selectedRakebackIds.length === 0 ? (
                <p className="text-sm text-sx-muted text-center">Nenhuma pessoa selecionada para rakeback.</p>
              ) : (
                selectedRakebackIds.map((userId, index) => {
                  const person = staffOptions.find((option) => option.id === userId)
                  if (!person) return null

                  const currentPercent = Number(selectedRakebackPercent[userId] || 0)
                  const othersTotal = selectedRakebackIds.reduce((sum, id) => {
                    if (id === userId) return sum
                    const value = Number(selectedRakebackPercent[id] || 0)
                    return sum + (Number.isFinite(value) && value > 0 ? value : 0)
                  }, 0)
                  const maxForCurrent = Math.max(0, Number((100 - othersTotal).toFixed(2)))
                  const allowedOptionsSet = new Set<number>([
                    ...rakebackStepOptions.filter((value) => value <= maxForCurrent),
                    Number(currentPercent.toFixed(2)),
                  ])
                  const allowedOptions = Array.from(allowedOptionsSet).sort((a, b) => a - b)
                  const isActive = activeRakebackIndex === index

                  if (!isActive) return null

                  return (
                    <div key={`rakeback-selected-${userId}`} className="rounded-lg border border-sx-cyan/40 bg-sx-cyan/10 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold text-sx-cyan">{person.name}</p>
                        <span className="text-xs text-sx-cyan/80">Editando</span>
                      </div>
                      <label className="text-xs uppercase tracking-wide text-sx-muted block mb-2">% de Rakeback</label>
                      <select
                        value={selectedRakebackPercent[userId] ?? '0'}
                        onChange={(e) => {
                          const nextValue = e.target.value
                          const nextNumber = Number(nextValue || 0)
                          const currentTotal = selectedRakebackIds.reduce((sum, id) => {
                            const value = Number(selectedRakebackPercent[id] || 0)
                            return sum + (Number.isFinite(value) && value > 0 ? value : 0)
                          }, 0)
                          const totalWithNext = currentTotal - currentPercent + nextNumber

                          setSelectedRakebackPercent((prev) => ({ ...prev, [userId]: nextValue }))

                          if (totalWithNext >= 100) {
                            setActiveRakebackIndex(null)
                            return
                          }

                          const nextIndex = index + 1
                          setActiveRakebackIndex(nextIndex < selectedRakebackIds.length ? nextIndex : null)
                        }}
                        className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm text-zinc-100 font-medium"
                      >
                        {allowedOptions.map((value) => (
                          <option key={`${userId}-${value}`} value={String(value)}>{value}%</option>
                        ))}
                      </select>
                    </div>
                  )
                })
              )}
            </div>

            <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3 text-sm">
              <p className="text-zinc-300">Total de rakeback: <span className={selectedStaffTotalPercent > 100 ? 'text-red-400 font-bold' : 'text-sx-cyan font-bold'}>{selectedStaffTotalPercent.toFixed(2)}%</span> de 100%</p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowStaffModal(false)
                  setActiveRakebackIndex(null)
                  setStaffModalError(null)
                }}
                className="rounded-lg border border-sx-border2 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-sx-input transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveStaff}
                disabled={staffLoading || selectedStaffTotalPercent > 100}
                className="rounded-lg bg-sx-cyan px-4 py-2 text-sm font-bold text-sx-bg hover:bg-sx-cyan-dim disabled:opacity-50 transition-colors"
              >
                {staffLoading ? 'Salvando...' : 'Salvar Staff'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSangeurModal && session && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-6" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(0,200,224,0.2)' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white">Gerenciar SANGEUR</h3>
                <p className="mt-1 text-sm text-sx-muted">Habilite, desabilite ou redefina senhas dos acessos ao caixa móvel deste home game.</p>
              </div>
              <button
                type="button"
                onClick={closeSangeurModal}
                className="rounded-lg border border-sx-border2 px-3 py-1 text-xs font-bold text-zinc-300 hover:bg-sx-input"
              >
                Fechar
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-sx-cyan/30 bg-sx-cyan/5 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-sx-cyan">Home Game ID (para login na POS)</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg border border-sx-border2 bg-sx-card px-3 py-2 font-mono text-xs text-zinc-200">{session.homeGame.id}</code>
                <button
                  type="button"
                  onClick={() => copySangeur('homeGameId', session.homeGame.id)}
                  className="rounded-lg border border-sx-cyan/40 bg-sx-cyan/10 px-3 py-2 text-xs font-bold text-sx-cyan hover:bg-sx-cyan/20"
                >
                  {sangeurCopied === 'homeGameId' ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-xl border border-white/8 bg-black/20 p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40">Habilitar novo acesso</p>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-sx-muted">Participante SANGEUR</label>
                <select
                  value={sangeurUserId}
                  onChange={(e) => setSangeurUserId(e.target.value)}
                  className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none"
                >
                  <option value="">Selecione um membro…</option>
                  {sangeurMembers.map((m) => (
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
                {sangeurLoading ? 'Salvando…' : 'Habilitar SANGEUR'}
              </button>

              {sangeurIssuedCredential && (
                <div className="space-y-2 rounded-lg border border-sx-cyan/30 bg-sx-cyan/10 p-3">
                  <p className="text-xs font-bold text-sx-cyan">Credencial de {sangeurIssuedCredential.userName}</p>
                  <div className="flex items-center gap-2">
                    <span className="w-16 text-[10px] uppercase tracking-wide text-sx-cyan/70">Usuário</span>
                    <code className="flex-1 truncate rounded border border-sx-border2 bg-sx-card px-2 py-1 font-mono text-xs text-zinc-200">{sangeurIssuedCredential.username}</code>
                    <button
                      type="button"
                      onClick={() => copySangeur('username', sangeurIssuedCredential.username)}
                      className="rounded border border-sx-cyan/40 bg-sx-cyan/10 px-2 py-1 text-[11px] font-bold text-sx-cyan hover:bg-sx-cyan/20"
                    >
                      {sangeurCopied === 'username' ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-16 text-[10px] uppercase tracking-wide text-sx-cyan/70">Senha</span>
                    <code className="flex-1 truncate rounded border border-sx-border2 bg-sx-card px-2 py-1 font-mono text-xs text-zinc-200">{sangeurIssuedCredential.temporaryPassword}</code>
                    <button
                      type="button"
                      onClick={() => copySangeur('password', sangeurIssuedCredential.temporaryPassword)}
                      className="rounded border border-sx-cyan/40 bg-sx-cyan/10 px-2 py-1 text-[11px] font-bold text-sx-cyan hover:bg-sx-cyan/20"
                    >
                      {sangeurCopied === 'password' ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">Acessos cadastrados</p>
              {sangeurAccesses.length === 0 ? (
                <p className="text-xs text-sx-muted">Nenhum acesso cadastrado ainda.</p>
              ) : (
                <div className="space-y-2">
                  {sangeurAccesses.map((access) => (
                    <div key={access.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-xs">
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
          </div>
        </div>
      )}

      {showFinishConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <h3 className="text-lg font-bold text-white">Finalizar sessao</h3>
            <p className="mt-2 text-sm text-zinc-300">
              Esta acao encerra a sessao e nao podera ser desfeita.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowFinishConfirmModal(false)}
                disabled={actionLoading}
                className="rounded-lg border border-sx-border2 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-sx-input disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={finishSession}
                disabled={actionLoading}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {actionLoading ? 'Finalizando...' : 'Confirmar finalizacao'}
              </button>
            </div>
</div>
        </div>
      )}
    </div>
  )
}
