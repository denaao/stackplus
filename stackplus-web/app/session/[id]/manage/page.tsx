'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'
import { joinSession, leaveSession } from '@/services/socket'
import { getSocket } from '@/services/socket'
import { useAuthStore } from '@/store/useStore'

type PdfFontWeight = 'normal' | 'bold'

interface Session {
  id: string; status: string; startedAt?: string
  rake?: string | number | null
  caixinha?: string | number | null
  caixinhaPerStaff?: number
  caixinhaDistribution?: Array<{ userId: string; name: string; amount: number; pixType?: string | null; pixKey?: string | null }>
  totalRakeback?: number
  rakebackDistribution?: Array<{ userId: string; name: string; percent: number; amount: number; pixType?: string | null; pixKey?: string | null }>
  pokerVariant?: 'HOLDEN' | 'BUTTON_CHOICE' | 'PINEAPPLE' | 'OMAHA' | 'OMAHA_FIVE' | 'OMAHA_SIX'
  gameType?: 'CASH_GAME' | 'TOURNAMENT'
  homeGame: { name: string; chipValue: string; gameType?: 'CASH_GAME' | 'TOURNAMENT'; hostId: string }
  cashier?: { id: string; name: string }
  playerStates: PlayerState[]
  staffAssignments: StaffAssignment[]
  rakebackAssignments: RakebackAssignment[]
  participantAssignments: ParticipantAssignment[]
}

interface StaffAssignment {
  userId: string
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
    receivedPayments: number
    payoutsCreatedPendingApproval: number
    payoutsSkipped: number
  }
  charges: FinancialReportItem[]
  receivedPayments: Array<{ userId: string; name: string; amount: number; paidAt: string }>
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

function extractBankBalance(payload: any): number | null {
  const candidates = [
    payload?.saldo,
    payload?.balance,
    payload?.availableBalance,
    payload?.disponivel,
    payload?.valor,
    payload?.data?.saldo,
    payload?.data?.balance,
    payload?.data?.availableBalance,
    payload?.conta?.saldo,
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
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showStaffModal, setShowStaffModal] = useState(false)
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([])
  const [selectedRakebackIds, setSelectedRakebackIds] = useState<string[]>([])
  const [selectedRakebackPercent, setSelectedRakebackPercent] = useState<Record<string, string>>({})
  const [staffLoading, setStaffLoading] = useState(false)
  const [participantOptions, setParticipantOptions] = useState<ParticipantOption[]>([])
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([])
  const [participantsLoading, setParticipantsLoading] = useState(false)
  const [participantsLoaded, setParticipantsLoaded] = useState(false)
  const [financialReport, setFinancialReport] = useState<FinancialReport | null>(null)
  const [financialLoading, setFinancialLoading] = useState(false)
  const [bankBalance, setBankBalance] = useState<number | null>(null)
  const [bankBalanceLoading, setBankBalanceLoading] = useState(false)
  const [bankBalanceError, setBankBalanceError] = useState<string | null>(null)
  const [approvingPixId, setApprovingPixId] = useState<string | null>(null)
  const [approvedPixIds, setApprovedPixIds] = useState<string[]>([])
  const [copiedChargeId, setCopiedChargeId] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)

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
      setSelectedRakebackIds(normalized.rakebackAssignments.map((assignment) => assignment.userId))
      setSelectedRakebackPercent(normalized.rakebackAssignments.reduce<Record<string, string>>((acc, assignment) => {
        acc[assignment.userId] = String(Number(assignment.percent || 0))
        return acc
      }, {}))
      setShowStaffModal(true)
    } catch (err) {
      alert(typeof err === 'string' ? err : 'Não foi possível carregar o staff')
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
      alert('A soma do rakeback do staff não pode passar de 100%')
      return
    }

    setStaffLoading(true)
    try {
      await api.put(`/sessions/${sessionId}/staff`, { userIds: selectedStaffIds })
      const { data } = await api.put(`/sessions/${sessionId}/rakeback`, { assignments: rakebackPayload })
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
      alert(typeof err === 'string' ? err : 'Não foi possível gerar o PDF da liquidação financeira')
    } finally {
      setPdfLoading(false)
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

  useEffect(() => {
    if (!session) return
    const currentIsHost = user?.id === session.homeGame.hostId
    if (!currentIsHost || session.status !== 'FINISHED') return
    loadBankBalance()
  }, [session?.id, session?.status, user?.id])

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-yellow-400 font-black text-2xl">STACKPLUS</div>
  if (!session) return null

  const gameType = session.gameType || session.homeGame.gameType || 'CASH_GAME'
  const pokerVariant = session.pokerVariant || 'HOLDEN'
  const isHost = user?.id === session.homeGame.hostId
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
        {isHost && session.status !== 'FINISHED' && (
          <div className="mb-6 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-blue-300">Staff da partida</p>
                <p className="mt-1 text-sm text-zinc-300">{session.status === 'WAITING' ? 'Selecione quem faz parte do staff e configure o rakeback.' : 'Gerencie o staff durante a partida.'}</p>
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
        )}

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

        {session.status === 'FINISHED' && isHost && (
          <div className="mb-6 rounded-xl border border-purple-500/25 bg-purple-500/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-purple-200">Liquidação Financeira (Annapay)</p>
                <p className="mt-1 text-sm text-zinc-300">Gera cobranças PIX para negativos pós-pago e ordens PIX pendentes para positivos.</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={loadBankBalance}
                  disabled={bankBalanceLoading}
                  className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                >
                  {bankBalanceLoading ? 'Atualizando saldo...' : 'Atualizar saldo'}
                </button>
                {financialReport && (
                  <button
                    type="button"
                    onClick={downloadFinancialReportPdf}
                    disabled={!canDownloadFinancialPdf || pdfLoading}
                    className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {pdfLoading ? 'Gerando PDF...' : 'Baixar PDF da liquidação'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={generateFinancialReport}
                  disabled={financialLoading}
                  className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-50"
                >
                  {financialLoading ? 'Gerando...' : 'Gerar relatório financeiro'}
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-cyan-500/25 bg-cyan-500/10 p-3">
              <p className="text-xs uppercase tracking-wide text-cyan-200">Saldo bancário atual</p>
              {bankBalanceLoading ? (
                <p className="mt-1 text-sm text-zinc-300">Consultando saldo...</p>
              ) : bankBalance != null ? (
                <p className="mt-1 text-lg font-black text-cyan-100">{formatCurrency(bankBalance)}</p>
              ) : (
                <p className="mt-1 text-sm text-zinc-300">Saldo indisponível</p>
              )}
              {bankBalanceError && <p className="mt-1 text-xs text-red-300">{bankBalanceError}</p>}
            </div>

            {financialReport && (
              <div className="mt-4 space-y-4">
                <div className={`rounded-lg border p-3 text-xs ${canDownloadFinancialPdf ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-zinc-700 bg-zinc-900/60 text-zinc-400'}`}>
                  {canDownloadFinancialPdf
                    ? 'Liquidação concluída. O PDF completo desta etapa já pode ser baixado.'
                    : 'O PDF será liberado quando não houver pendências manuais e todas as ordens PIX tiverem sido enviadas pelo host.'}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
                  <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-2.5">
                    <p className="text-zinc-500">Módulo</p>
                    <p className="mt-0.5 font-semibold text-zinc-100">{financialReport.financialModule}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-2.5">
                    <p className="text-zinc-500">Cobranças</p>
                    <p className="mt-0.5 font-semibold text-zinc-100">{financialReport.summary.chargesCreated}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-2.5">
                    <p className="text-zinc-500">Pagamentos recebidos</p>
                    <p className="mt-0.5 font-semibold text-zinc-100">{financialReport.summary.receivedPayments}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-2.5">
                    <p className="text-zinc-500">Ordens PIX</p>
                    <p className="mt-0.5 font-semibold text-zinc-100">{financialReport.summary.payoutsCreatedPendingApproval}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-2.5">
                    <p className="text-zinc-500">Gerado em</p>
                    <p className="mt-0.5 font-semibold text-zinc-100">{formatDateTime(financialReport.generatedAt)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-emerald-300">✅ Pagamentos recebidos pelo host</p>
                  {financialReport.receivedPayments.length === 0 ? (
                    <p className="text-sm text-zinc-500">Nenhum pagamento recebido identificado até o momento.</p>
                  ) : (
                    financialReport.receivedPayments.map((item) => (
                      <div key={`received-${item.userId}`} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <span className="min-w-0 flex-1 truncate font-bold text-zinc-100">{item.name}</span>
                          <span className="shrink-0 text-base font-black text-emerald-300">+{formatCurrency(Number(item.amount))}</span>
                          <span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-100 whitespace-nowrap">
                            Pago em: {formatDateTime(item.paidAt)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
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
                      const isCopied = copiedChargeId === item.userId
                      return (
                        <div key={`charge-${item.userId}`} className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold text-zinc-100">{item.name}</p>
                              <p className="text-lg font-black text-red-400">-{formatCurrency(Number(item.amount))}</p>
                            </div>
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
                              <p className="text-lg font-black text-green-400">+{formatCurrency(Number(item.amount))}</p>
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
                    {p.hasCashedOut && (
                      <p className="text-xs text-zinc-400">Cashout: R$ {parseFloat(p.chipsOut).toFixed(2)}</p>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {session.staffAssignments.length > 0 && (
          <div className="mt-6 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4">
            <p className="text-xs uppercase tracking-wide text-blue-200">Staff da partida</p>
            <p className="mt-2 text-sm text-zinc-200">{session.staffAssignments.map((assignment) => assignment.user.name).join(', ')}</p>
          </div>
        )}
        {session.status === 'FINISHED' && sessionRake > 0 && (
          <div className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
            <p className="text-xs uppercase tracking-wide text-amber-200">Divisão do Rakeback</p>
            <p className="mt-1 text-sm text-zinc-200">Rake registrado: R$ {sessionRake.toFixed(2)}</p>
            <p className="mt-1 text-sm text-zinc-300">Total de rakeback distribuído: R$ {Number(session.totalRakeback || 0).toFixed(2)}</p>
            {staffRakebackWinners.length > 0 ? (
              <div className="mt-3 space-y-2">
                {staffRakebackWinners.map((item) => (
                  <div key={item.userId} className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-zinc-900/60 px-3 py-2 text-sm">
                    <div>
                      <span className="text-zinc-100">{item.name}</span>
                      <p className="text-xs text-zinc-400">{Number(item.percent).toFixed(2)}% do rake</p>
                    </div>
                    <span className="font-semibold text-amber-300">R$ {Number(item.amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-zinc-400">Não há rakeback configurado para esta sessão.</p>
            )}
          </div>
        )}
        {session.status === 'FINISHED' && sessionCaixinha > 0 && (
          <div className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
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
      </main>

      {showStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-6">
            <h3 className="text-lg font-bold">Staff da Partida</h3>
            <p className="mt-1 text-sm text-zinc-400">Staff (caixinha) e Rakeback são configurações separadas.</p>

            <p className="mt-4 text-xs uppercase tracking-wide text-zinc-500">Staff da partida (divide caixinha)</p>
            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
              {staffOptions.map((person) => {
                const checked = selectedStaffIds.includes(person.id)
                return (
                  <label key={`staff-${person.id}`} className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 cursor-pointer">
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

            <p className="mt-4 text-xs uppercase tracking-wide text-zinc-500">Rakeback (% do rake)</p>
            <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
              {staffOptions.map((person) => {
                const checked = selectedRakebackIds.includes(person.id)
                return (
                  <div key={`rakeback-${person.id}`} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedRakebackIds((prev) => checked ? prev.filter((id) => id !== person.id) : [...prev, person.id])
                          if (!checked && selectedRakebackPercent[person.id] == null) {
                            setSelectedRakebackPercent((prev) => ({ ...prev, [person.id]: '0' }))
                          }
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-zinc-100">{person.name}</p>
                        {person.email && <p className="text-xs text-zinc-500">{person.email}</p>}
                      </div>
                    </label>
                    {checked && (
                      <div className="mt-3">
                        <label className="text-xs uppercase tracking-wide text-zinc-500">% de Rakeback</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={selectedRakebackPercent[person.id] ?? '0'}
                          onChange={(e) => setSelectedRakebackPercent((prev) => ({ ...prev, [person.id]: e.target.value }))}
                          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                          placeholder="0.00"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
              <p className="text-zinc-300">Total de rakeback selecionado: <span className={selectedStaffTotalPercent > 100 ? 'text-red-400 font-semibold' : 'text-emerald-300 font-semibold'}>{selectedStaffTotalPercent.toFixed(2)}%</span></p>
              {selectedStaffTotalPercent > 100 && <p className="mt-1 text-xs text-red-400">A soma não pode ultrapassar 100%.</p>}
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
                disabled={staffLoading || selectedStaffTotalPercent > 100}
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
