'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useSangeurAuthStore } from '@/store/useStore'
import { getErrorMessage } from '@/lib/errors'

type PaymentMethod = 'PIX_QR' | 'VOUCHER' | 'CASH' | 'CARD'

type FinancialModule = 'POSTPAID' | 'PREPAID' | 'HYBRID'

interface OperationalSession {
  id: string
  status: 'WAITING' | 'ACTIVE' | 'FINISHED'
  createdAt: string
  startedAt?: string | null
  chipValue: number
  financialModule?: FinancialModule
  openShiftId?: string | null
  _count: { playerStates: number; transactions: number }
}

interface SessionPlayer {
  userId: string
  name: string
  avatarUrl?: string | null
  paymentMode?: 'POSTPAID' | 'PREPAID' | null
  chipsIn: number
  chipsOut: number
  currentStack: number
  result: number
  hasCashedOut: boolean
  inSession: boolean
}

interface SessionCandidate {
  userId: string
  name: string
  avatarUrl?: string | null
  paymentMode?: 'POSTPAID' | 'PREPAID' | null
}

interface ParticipantsPayload {
  players: SessionPlayer[]
  candidates: SessionCandidate[]
}

interface ShiftMovement {
  id: string
  type: 'INITIAL_LOAD' | 'RELOAD' | 'RETURN'
  chips: string | number
  note?: string | null
  createdAt: string
}

interface ShiftSale {
  id: string
  chips: string | number
  amount: string | number
  paymentMethod: PaymentMethod
  paymentStatus: 'PENDING' | 'PAID' | 'CANCELED'
  paymentReference?: string | null
  voucherCode?: string | null
  playerName?: string | null
  note?: string | null
  createdAt: string
}

interface ShiftDetail {
  id: string
  sessionId: string
  status: 'OPEN' | 'CLOSED'
  initialChips: string | number
  note?: string | null
  openedAt: string
  closedAt?: string | null
  session: {
    id: string
    status: string
    chipValue?: string | number | null
    homeGame: { id: string; name: string; chipValue: string | number }
  }
  summary: {
    initialChips: number
    reloadedChips: number
    soldChips: number
    returnedChips: number
    availableChips: number
    totalSalesAmount: number
    paidAmount: number
    pendingAmount: number
    pendingVoucherAmount: number
  }
  movements: ShiftMovement[]
  sales: ShiftSale[]
}

interface VoucherReceiptData {
  saleId: string
  voucherCode?: string | null
  playerName?: string | null
  playerCpf?: string | null
  chips: number
  chipValue: number
  amount: number
  paymentStatus: 'PENDING' | 'PAID' | 'CANCELED'
  paymentReference?: string | null
  createdAt: string
  settledAt?: string | null
  note?: string | null
  homeGame: { id: string; name: string }
  session: { id: string; createdAt: string }
  operator: { username: string; name?: string | null }
  playerUnpaidEntries?: Array<{
    id: string
    origin: 'C' | 'S'
    type: 'BUYIN' | 'REBUY' | 'ADDON'
    chips: number
    amount: number
    createdAt: string
  }>
  playerUnpaidTotal?: number
}

interface ClosingReportData {
  shift: {
    id: string
    status: 'OPEN' | 'CLOSED'
    openedAt: string
    closedAt?: string | null
    note?: string | null
  }
  homeGame: {
    id: string
    name: string
  }
  session: {
    id: string
    status: string
    chipValue: number
  }
  operator: {
    id: string
    username: string
    name?: string | null
  }
  inventory: {
    initialChips: number
    reloadedChips: number
    soldChips: number
    returnedChips: number
    closingBalanceChips: number
    totalLoadedChips: number
  }
  finance: {
    totalSalesAmount: number
    paidAmount: number
    pendingAmount: number
    pendingVoucherAmount: number
    salesCount: number
    salesPaidCount: number
    salesPendingCount: number
    salesCanceledCount: number
  }
  paymentBreakdown: Array<{
    paymentMethod: PaymentMethod
    salesCount: number
    chipsTotal: number
    amountTotal: number
    amountPaid: number
    amountPending: number
    amountCanceled: number
  }>
  pendingSales: Array<{
    saleId: string
    paymentMethod: PaymentMethod
    voucherCode?: string | null
    playerName?: string | null
    amount: number
    chips: number
    paymentReference?: string | null
    createdAt: string
  }>
}

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatChips(value: string | number) {
  return Number(value || 0).toLocaleString('pt-BR')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default function SangeurHomePage() {
  const router = useRouter()
  const token = useSangeurAuthStore((s) => s.token)
  const user = useSangeurAuthStore((s) => s.user)
  const sangeur = useSangeurAuthStore((s) => s.sangeur)
  const setMustChangePassword = useSangeurAuthStore((s) => s.setMustChangePassword)
  const logoutSangeur = useSangeurAuthStore((s) => s.logoutSangeur)

  const [sessions, setSessions] = useState<OperationalSession[]>([])
  const [activeShift, setActiveShift] = useState<ShiftDetail | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [participants, setParticipants] = useState<ParticipantsPayload>({ players: [], candidates: [] })
  const [participantsError, setParticipantsError] = useState<string>('')
  const [loadingParticipants, setLoadingParticipants] = useState(false)

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmNewPassword: '' })
  const [openShiftForm, setOpenShiftForm] = useState({ sessionId: '', initialChips: '', note: '' })
  const [saleForm, setSaleForm] = useState({ chips: '', paymentMethod: 'PIX_QR' as PaymentMethod, sessionUserId: '', playerName: '', note: '', paymentReference: '' })
  const [reloadForm, setReloadForm] = useState({ chips: '', note: '' })
  const [closeForm, setCloseForm] = useState({ returnedChips: '', note: '' })
  const [addCandidateId, setAddCandidateId] = useState('')

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  // Payload da cobrança PIX ANNAPAY (shape varia entre endpoints).
  const [pixQrModal, setPixQrModal] = useState<{
    qrCodeBase64?: string
    pixCopyPaste?: string
    [key: string]: unknown
  } | null>(null)
  const [closingReportModal, setClosingReportModal] = useState<ClosingReportData | null>(null)

  const pendingVoucherSales = useMemo(
    () => activeShift?.sales.filter((sale) => sale.paymentMethod === 'VOUCHER' && sale.paymentStatus === 'PENDING') || [],
    [activeShift]
  )

  const pendingVoucherGroups = useMemo(() => {
    const groups = new Map<string, {
      key: string
      playerName: string
      totalChips: number
      totalAmount: number
      saleIds: string[]
      latestSaleId: string
    }>()
    for (const sale of pendingVoucherSales) {
      const name = (sale.playerName || 'Jogador').trim() || 'Jogador'
      const key = name.toLowerCase()
      const chips = Number(sale.chips) || 0
      const amount = Number(sale.amount) || 0
      const existing = groups.get(key)
      if (existing) {
        existing.totalChips += chips
        existing.totalAmount += amount
        existing.saleIds.push(sale.id)
        // manter o saleId mais recente (sales já vem ordenado desc no backend, mas garantimos aqui)
        if (new Date(sale.createdAt) >= new Date(activeShift?.sales.find((s) => s.id === existing.latestSaleId)?.createdAt || 0)) {
          existing.latestSaleId = sale.id
        }
      } else {
        groups.set(key, {
          key,
          playerName: name,
          totalChips: chips,
          totalAmount: amount,
          saleIds: [sale.id],
          latestSaleId: sale.id,
        })
      }
    }
    return Array.from(groups.values()).sort((a, b) => a.playerName.localeCompare(b.playerName))
  }, [pendingVoucherSales, activeShift])

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeShift?.sessionId) || null,
    [sessions, activeShift]
  )

  const isPostpaidSession = (activeSession?.financialModule || 'POSTPAID') === 'POSTPAID'
  const defaultPaymentMethod: PaymentMethod = isPostpaidSession ? 'VOUCHER' : 'PIX_QR'

  useEffect(() => {
    if (!token || !sangeur) {
      router.replace('/sangeur/login')
      return
    }

    const homeGameId = sangeur.homeGameId

    async function loadOperationalData() {
      setLoadingData(true)
      try {
        const { data } = await api.get(`/sangeur/home-games/${homeGameId}/sessions`)
        const list = Array.isArray(data) ? data : []
        setSessions(list)

        const openShiftSession = list.find((session: OperationalSession) => session.openShiftId)
        if (openShiftSession?.openShiftId) {
          const shiftResponse = await api.get(`/sangeur/shifts/${openShiftSession.openShiftId}`)
          setActiveShift(shiftResponse.data)
        } else {
          setActiveShift(null)
        }
      } catch (err) {
        setError(getErrorMessage(err, 'Nao foi possivel carregar os dados operacionais'))
      } finally {
        setLoadingData(false)
      }
    }

    loadOperationalData()
  }, [token, sangeur, router])

  // Carrega participantes da sessão quando tem turno aberto
  useEffect(() => {
    if (activeShift?.sessionId) {
      loadParticipants(activeShift.sessionId)
    } else {
      setParticipants({ players: [], candidates: [] })
    }
  }, [activeShift?.sessionId])

  // Default do método de pagamento conforme regime financeiro da sessão
  useEffect(() => {
    setSaleForm((prev) => (
      prev.paymentMethod === defaultPaymentMethod ? prev : { ...prev, paymentMethod: defaultPaymentMethod }
    ))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPaymentMethod, activeShift?.id])

  async function refreshShift(shiftId: string) {
    const { data } = await api.get(`/sangeur/shifts/${shiftId}`)
    setActiveShift(data)
    return data as ShiftDetail
  }

  async function loadParticipants(sessionId: string) {
    setLoadingParticipants(true)
    setParticipantsError('')
    try {
      const { data } = await api.get<ParticipantsPayload>(`/sangeur/sessions/${sessionId}/participants`)
      setParticipants({
        players: Array.isArray(data?.players) ? data.players : [],
        candidates: Array.isArray(data?.candidates) ? data.candidates : [],
      })
    } catch (err) {
      // O interceptor do services/api.ts rejeita com string, não com Error.
      const baseMsg = getErrorMessage(err, 'Falha ao carregar jogadores')
      const msg = `${baseMsg} (sessionId=${sessionId})`
      console.error('[sangeur] loadParticipants failed:', err)
      setParticipantsError(msg)
      setParticipants({ players: [], candidates: [] })
    } finally {
      setLoadingParticipants(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!sangeur) return

    setError('')
    setSuccess('')

    if (passwordForm.newPassword.length < 6) {
      setError('A nova senha precisa ter no minimo 6 caracteres.')
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      setError('A confirmacao da nova senha nao confere.')
      return
    }

    setLoading(true)
    try {
      await api.put('/auth/sangeur/password', {
        homeGameId: sangeur.homeGameId,
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })

      setMustChangePassword(false)
      setPasswordForm({ currentPassword: '', newPassword: '', confirmNewPassword: '' })
      setSuccess('Senha alterada com sucesso. A POS esta liberada para uso.')
    } catch (err) {
      setError(getErrorMessage(err, 'Nao foi possivel alterar a senha'))
    } finally {
      setLoading(false)
    }
  }

  async function handleOpenShift(e: React.FormEvent) {
    e.preventDefault()
    if (!sangeur) return

    setError('')
    setSuccess('')

    const eligibleSession =
      sessions.find((s) => s.status === 'ACTIVE') ||
      sessions.find((s) => s.status === 'WAITING')
    if (!eligibleSession) {
      setError('Nenhuma sessao ativa ou aguardando encontrada.')
      return
    }

    const initialChips = Number(openShiftForm.initialChips || 0)
    if (initialChips < 0) {
      setError('Quantidade inicial de fichas invalida.')
      return
    }

    setLoading(true)
    try {
      await api.post('/sangeur/shifts/open', {
        homeGameId: sangeur.homeGameId,
        sessionId: eligibleSession.id,
        initialChips,
        note: openShiftForm.note || undefined,
      })

      router.push('/sangeur/pos')
    } catch (err) {
      setError(getErrorMessage(err, 'Nao foi possivel abrir o turno'))
    } finally {
      setLoading(false)
    }
  }

  async function handleRegisterSale(e: React.FormEvent) {
    e.preventDefault()
    if (!activeShift) return

    setError('')
    setSuccess('')

    const chips = Number(saleForm.chips || 0)
    if (chips <= 0) {
      setError('Informe a quantidade de fichas vendidas.')
      return
    }
    if (!saleForm.sessionUserId) {
      setError('Selecione o jogador na lista de participantes.')
      return
    }

    setLoading(true)
    try {
      const { data } = await api.post(`/sangeur/shifts/${activeShift.id}/sales`, {
        chips,
        paymentMethod: saleForm.paymentMethod,
        sessionUserId: saleForm.sessionUserId,
        playerName: saleForm.playerName || undefined,
        note: saleForm.note || undefined,
        paymentReference: saleForm.paymentReference || undefined,
      })

      const shiftData = data.shift || data
      const pixData = data.pixQrData

      setActiveShift(shiftData)
      setSaleForm({ chips: '', paymentMethod: defaultPaymentMethod, sessionUserId: '', playerName: '', note: '', paymentReference: '' })
      if (shiftData?.sessionId) {
        loadParticipants(shiftData.sessionId)
      }

      if (pixData) setPixQrModal(pixData)
      setSuccess('Venda registrada com sucesso.')
    } catch (err) {
      setError(getErrorMessage(err, 'Nao foi possivel registrar a venda'))
    } finally {
      setLoading(false)
    }
  }

  function handleSelectPlayer(player: SessionPlayer | SessionCandidate) {
    setSaleForm((prev) => ({
      ...prev,
      sessionUserId: player.userId,
      playerName: player.name,
    }))
  }

  function handleAddCandidate() {
    if (!addCandidateId) return
    const candidate = participants.candidates.find((c) => c.userId === addCandidateId)
    if (!candidate) return
    handleSelectPlayer(candidate)
    setAddCandidateId('')
    setSuccess(`${candidate.name} selecionado(a) — informe as fichas e registre a venda.`)
    setTimeout(() => setSuccess(''), 2500)
  }

  async function handleReload(e: React.FormEvent) {
    e.preventDefault()
    if (!activeShift) return

    setError('')
    setSuccess('')

    const chips = Number(reloadForm.chips || 0)
    if (chips <= 0) {
      setError('Informe a quantidade de fichas para reforco.')
      return
    }

    setLoading(true)
    try {
      const { data } = await api.post(`/sangeur/shifts/${activeShift.id}/reload`, {
        chips,
        note: reloadForm.note || undefined,
      })

      setActiveShift(data)
      setReloadForm({ chips: '', note: '' })
      setSuccess('Reforco de fichas registrado com sucesso.')
    } catch (err) {
      setError(getErrorMessage(err, 'Nao foi possivel registrar o reforco'))
    } finally {
      setLoading(false)
    }
  }

  async function handlePrintVoucher(saleId: string) {
    setError('')

    try {
      const { data } = await api.get<VoucherReceiptData>(`/sangeur/sales/${saleId}/voucher-receipt`)
      const issuedAt = new Date(data.createdAt).toLocaleString('pt-BR')
      const playerName = data.playerName || 'Jogador nao informado'
      const playerCpf = data.playerCpf || '-'
      const operatorName = data.operator.name || data.operator.username
      const entries = Array.isArray(data.playerUnpaidEntries) && data.playerUnpaidEntries.length > 0
        ? data.playerUnpaidEntries
        : [{ id: data.saleId, origin: 'S' as const, type: 'BUYIN' as const, chips: data.chips, amount: data.amount, createdAt: data.createdAt }]
      const total = typeof data.playerUnpaidTotal === 'number' && data.playerUnpaidTotal > 0
        ? data.playerUnpaidTotal
        : entries.reduce((acc, v) => acc + Number(v.amount || 0), 0)

      const entriesRows = entries.map((v) => {
        const when = new Date(v.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        return `<div class="line"><span>${escapeHtml(v.origin)} ${escapeHtml(when)} - ${formatChips(v.chips)} fichas</span><span></span></div>`
      }).join('')

      const statusLabel = data.paymentStatus === 'PENDING' ? 'A pagar' : data.paymentStatus === 'PAID' ? 'Pago' : 'Cancelado'

      const printHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Felipeta ${escapeHtml(playerName)}</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      body { font-family: Consolas, 'Courier New', monospace; color: #000; margin: 0; padding: 0; }
      .ticket { width: 72mm; border: 1px dashed #444; padding: 8px; }
      .center { text-align: center; }
      .title { font-size: 15px; font-weight: 700; margin: 0; }
      .muted { color: #333; font-size: 11px; }
      .divider { border-top: 1px dashed #444; margin: 8px 0; }
      .line { display: flex; justify-content: space-between; font-size: 12px; margin: 2px 0; gap: 8px; }
      .player-name { font-size: 15px; font-weight: 700; margin: 0; }
      .player-cpf { font-size: 11px; color: #333; margin: 2px 0 0 0; }
      .value { font-size: 17px; font-weight: 700; }
      .spacer { height: 14px; }
      .signature { border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; font-size: 11px; }
    </style>
  </head>
  <body>
    <div class="ticket">
      <p class="title center">Ficha de Caixa</p>
      <p class="center muted">${escapeHtml(data.homeGame.name)}</p>
      <div class="divider"></div>
      <p class="player-name center">${escapeHtml(playerName)}</p>
      <p class="player-cpf center">CPF: ${escapeHtml(playerCpf)}</p>
      <div class="divider"></div>
      ${entriesRows}
      <div class="divider"></div>
      <div class="line"><span>Total</span><span class="value">${formatCurrency(total)}</span></div>
      <div class="line"><span>Status</span><span>${escapeHtml(statusLabel)}</span></div>
      <div class="line"><span>Operador</span><span>${escapeHtml(operatorName)}</span></div>
      <div class="line"><span>Emitido em</span><span>${escapeHtml(issuedAt)}</span></div>
      <div class="spacer"></div>
      <div class="spacer"></div>
      <p class="center signature">Assinatura do jogador</p>
    </div>
    <script>
      window.onload = () => {
        window.print();
      };
    </script>
  </body>
</html>`

      const popup = window.open('', '_blank', 'width=420,height=720')
      if (!popup) {
        setError('Nao foi possivel abrir a janela de impressao. Libere popups no navegador.')
        return
      }

      popup.document.open()
      popup.document.write(printHtml)
      popup.document.close()
    } catch (err) {
      setError(getErrorMessage(err, 'Nao foi possivel gerar a felipeta do vale'))
    }
  }

  async function handleSettleVoucher(saleId: string) {
    if (!activeShift) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      await api.patch(`/sangeur/sales/${saleId}/settle`, {})
      await refreshShift(activeShift.id)
      setSuccess('Vale liquidado com sucesso.')
    } catch (err) {
      setError(getErrorMessage(err, 'Nao foi possivel liquidar o vale'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSettleVoucherGroup(saleIds: string[]) {
    if (!activeShift || saleIds.length === 0) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      for (const saleId of saleIds) {
        await api.patch(`/sangeur/sales/${saleId}/settle`, {})
      }
      await refreshShift(activeShift.id)
      setSuccess(`${saleIds.length} vale(s) liquidado(s) com sucesso.`)
    } catch (err) {
      setError(getErrorMessage(err, 'Nao foi possivel liquidar os vales'))
      await refreshShift(activeShift.id)
    } finally {
      setLoading(false)
    }
  }

  function handlePrintClosingReport(report: ClosingReportData) {
    const openedAt = new Date(report.shift.openedAt).toLocaleString('pt-BR')
    const closedAt = report.shift.closedAt ? new Date(report.shift.closedAt).toLocaleString('pt-BR') : '-'
    const operatorName = report.operator.name || report.operator.username
    const note = report.shift.note ? escapeHtml(report.shift.note) : '-'

    const breakdownRows = report.paymentBreakdown
      .map((row) => `<tr>
        <td>${escapeHtml(row.paymentMethod)}</td>
        <td>${row.salesCount}</td>
        <td>${formatChips(row.chipsTotal)}</td>
        <td>${formatCurrency(row.amountTotal)}</td>
        <td>${formatCurrency(row.amountPaid)}</td>
        <td>${formatCurrency(row.amountPending)}</td>
      </tr>`)
      .join('')

    const pendingRows = report.pendingSales.length === 0
      ? '<tr><td colspan="5">Sem pendencias</td></tr>'
      : report.pendingSales
          .map((sale) => `<tr>
            <td>${escapeHtml(sale.paymentMethod)}</td>
            <td>${escapeHtml(sale.playerName || '-')}</td>
            <td>${formatChips(sale.chips)}</td>
            <td>${formatCurrency(sale.amount)}</td>
            <td>${escapeHtml(sale.voucherCode || sale.paymentReference || '-')}</td>
          </tr>`)
          .join('')

    const printHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Fechamento ${escapeHtml(report.shift.id)}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { font-family: Arial, sans-serif; color: #111; }
      h1 { margin: 0 0 8px; }
      h2 { margin: 16px 0 8px; font-size: 15px; }
      .meta { font-size: 12px; margin-bottom: 12px; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px; }
      .card { border: 1px solid #cfcfcf; border-radius: 6px; padding: 8px; font-size: 12px; }
      .label { color: #444; font-size: 11px; }
      .value { font-weight: 700; font-size: 16px; margin-top: 3px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
      th { background: #f2f2f2; }
    </style>
  </head>
  <body>
    <h1>Relatorio de Encerramento SANGEUR</h1>
    <div class="meta">
      Home Game: <strong>${escapeHtml(report.homeGame.name)}</strong><br/>
      Sessao: <strong>${escapeHtml(report.session.id)}</strong><br/>
      Operador: <strong>${escapeHtml(operatorName)}</strong> (@${escapeHtml(report.operator.username)})<br/>
      Abertura: <strong>${escapeHtml(openedAt)}</strong> | Fechamento: <strong>${escapeHtml(closedAt)}</strong><br/>
      Observacao: <strong>${note}</strong>
    </div>

    <div class="grid">
      <div class="card"><div class="label">Total vendido</div><div class="value">${formatCurrency(report.finance.totalSalesAmount)}</div></div>
      <div class="card"><div class="label">Total pago</div><div class="value">${formatCurrency(report.finance.paidAmount)}</div></div>
      <div class="card"><div class="label">Total pendente</div><div class="value">${formatCurrency(report.finance.pendingAmount)}</div></div>
      <div class="card"><div class="label">Fichas carregadas</div><div class="value">${formatChips(report.inventory.totalLoadedChips)}</div></div>
      <div class="card"><div class="label">Fichas vendidas</div><div class="value">${formatChips(report.inventory.soldChips)}</div></div>
      <div class="card"><div class="label">Saldo final fichas</div><div class="value">${formatChips(report.inventory.closingBalanceChips)}</div></div>
    </div>

    <h2>Consolidado por pagamento</h2>
    <table>
      <thead>
        <tr><th>Metodo</th><th>Vendas</th><th>Fichas</th><th>Total</th><th>Pago</th><th>Pendente</th></tr>
      </thead>
      <tbody>${breakdownRows}</tbody>
    </table>

    <h2>Pendencias</h2>
    <table>
      <thead>
        <tr><th>Metodo</th><th>Jogador</th><th>Fichas</th><th>Valor</th><th>Ref</th></tr>
      </thead>
      <tbody>${pendingRows}</tbody>
    </table>

    <script>window.onload = () => window.print();</script>
  </body>
</html>`

    const popup = window.open('', '_blank', 'width=980,height=760')
    if (!popup) {
      setError('Nao foi possivel abrir a janela de impressao. Libere popups no navegador.')
      return
    }

    popup.document.open()
    popup.document.write(printHtml)
    popup.document.close()
  }

  async function handleCloseShift(e: React.FormEvent) {
    e.preventDefault()
    if (!activeShift || !sangeur) return

    setError('')
    setSuccess('')

    const returnedChips = Number(closeForm.returnedChips || 0)
    if (returnedChips < 0) {
      setError('Quantidade de devolucao invalida.')
      return
    }

    setLoading(true)
    try {
      const closingShiftId = activeShift.id
      await api.post(`/sangeur/shifts/${closingShiftId}/close`, {
        returnedChips,
        note: closeForm.note || undefined,
      })

      const reportResponse = await api.get<ClosingReportData>(`/sangeur/shifts/${closingShiftId}/closing-report`)
      setClosingReportModal(reportResponse.data)

      setSuccess('Turno encerrado com sucesso.')
      setActiveShift(null)
      setCloseForm({ returnedChips: '', note: '' })

      const sessionsResponse = await api.get(`/sangeur/home-games/${sangeur.homeGameId}/sessions`)
      setSessions(Array.isArray(sessionsResponse.data) ? sessionsResponse.data : [])
    } catch (err) {
      setError(getErrorMessage(err, 'Nao foi possivel encerrar o turno'))
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    logoutSangeur()
    router.replace('/sangeur/login')
  }

  if (!token || !sangeur) return null

  return (
    <div className="min-h-screen bg-sx-bg px-4 py-6">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <div className="rounded-xl border border-sx-border bg-sx-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-sx-cyan">SANGEUR</h1>
              <p className="mt-1 text-sm text-sx-muted">Home Game: {sangeur.homeGameName}</p>
              <p className="text-xs text-sx-muted">Usuário: @{sangeur.username} • Operadora: {user?.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/sangeur/pos')}
                className="rounded-lg border border-sx-cyan/40 bg-sx-cyan/10 px-4 py-2 text-sm font-bold text-sx-cyan hover:bg-sx-cyan/20"
                title="Versão otimizada para maquininha"
              >
                Modo POS
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-sx-border2 px-4 py-2 text-sm font-bold text-zinc-200 hover:bg-sx-input"
              >
                Sair
              </button>
            </div>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        {success && <div className="rounded-lg border border-sx-cyan/30 bg-sx-cyan/10 p-3 text-sm text-sx-cyan">{success}</div>}

        {sangeur.mustChangePassword ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
            <h2 className="text-lg font-bold text-amber-200">Troca obrigatoria de senha</h2>
            <p className="mt-1 text-sm text-amber-100/80">Para liberar o uso da POS, altere a senha temporaria agora.</p>

            <form onSubmit={handleChangePassword} className="mt-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-300">Senha atual</label>
                <input
                  type="password"
                  required
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                  className="w-full rounded-lg border border-sx-border2 bg-sx-card px-4 py-3 text-sm focus:border-sx-cyan focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-300">Nova senha</label>
                <input
                  type="password"
                  required
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                  className="w-full rounded-lg border border-sx-border2 bg-sx-card px-4 py-3 text-sm focus:border-sx-cyan focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-300">Confirmar nova senha</label>
                <input
                  type="password"
                  required
                  value={passwordForm.confirmNewPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmNewPassword: e.target.value }))}
                  className="w-full rounded-lg border border-sx-border2 bg-sx-card px-4 py-3 text-sm focus:border-sx-cyan focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-sx-cyan py-3 font-bold text-sx-bg transition-colors hover:bg-sx-cyan disabled:opacity-50"
              >
                {loading ? 'Atualizando...' : 'Atualizar senha e liberar POS'}
              </button>
            </form>
          </div>
        ) : (
          <>
            {!activeShift && (
              <div className="rounded-xl border border-sx-border bg-sx-card p-5">
                <h2 className="text-lg font-bold">Abrir turno da SANGEUR</h2>
                <p className="mt-1 text-xs text-sx-muted">Informe as fichas recebidas do caixa para iniciar o turno.</p>

                {loadingData ? (
                  <p className="mt-4 text-sm text-sx-muted">Carregando...</p>
                ) : (
                  <form onSubmit={handleOpenShift} className="mt-4 space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs uppercase tracking-wide text-sx-muted">Fichas iniciais</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="0.01"
                        value={openShiftForm.initialChips}
                        onChange={(e) => setOpenShiftForm((prev) => ({ ...prev, initialChips: e.target.value }))}
                        className="w-full rounded-lg border border-sx-border2 bg-sx-input px-4 py-4 text-2xl font-bold focus:border-sx-cyan focus:outline-none"
                        placeholder="0"
                        autoFocus
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-lg bg-sx-cyan py-4 text-lg font-black text-sx-bg transition-colors hover:bg-sx-cyan disabled:opacity-50"
                    >
                      {loading ? 'Abrindo...' : 'Abrir turno'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {activeShift && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <div className="rounded-lg border border-sx-border bg-sx-card p-3">
                    <p className="text-[11px] uppercase tracking-wide text-sx-muted">Fichas iniciais</p>
                    <p className="mt-1 text-lg font-black text-zinc-100">{formatChips(activeShift.summary.initialChips)}</p>
                  </div>
                  <div className="rounded-lg border border-sx-border bg-sx-card p-3">
                    <p className="text-[11px] uppercase tracking-wide text-sx-muted">Reforco</p>
                    <p className="mt-1 text-lg font-black text-cyan-300">{formatChips(activeShift.summary.reloadedChips)}</p>
                  </div>
                  <div className="rounded-lg border border-sx-border bg-sx-card p-3">
                    <p className="text-[11px] uppercase tracking-wide text-sx-muted">Vendidas</p>
                    <p className="mt-1 text-lg font-black text-amber-300">{formatChips(activeShift.summary.soldChips)}</p>
                  </div>
                  <div className="rounded-lg border border-sx-border bg-sx-card p-3">
                    <p className="text-[11px] uppercase tracking-wide text-sx-muted">Saldo disponivel</p>
                    <p className="mt-1 text-lg font-black text-sx-cyan">{formatChips(activeShift.summary.availableChips)}</p>
                  </div>
                  <div className="rounded-lg border border-sx-border bg-sx-card p-3">
                    <p className="text-[11px] uppercase tracking-wide text-sx-muted">Total vendido</p>
                    <p className="mt-1 text-lg font-black text-zinc-100">{formatCurrency(activeShift.summary.totalSalesAmount)}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-sx-border bg-sx-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Jogadores na sessão</h3>
                    <span className="text-[11px] uppercase tracking-wide text-sx-muted">{isPostpaidSession ? 'Pós-pago • default VALE' : 'Pré-pago'}</span>
                  </div>
                  {participantsError && (
                    <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">Erro: {participantsError}</p>
                  )}
                  {loadingParticipants ? (
                    <p className="mt-3 text-sm text-sx-muted">Carregando jogadores...</p>
                  ) : participants.players.length === 0 ? (
                    <p className="mt-3 text-sm text-sx-muted">Nenhum jogador registrado na sessão ainda. Use &quot;Inserir jogador&quot; abaixo.</p>
                  ) : (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {participants.players.map((player) => {
                        const selected = saleForm.sessionUserId === player.userId
                        return (
                          <button
                            type="button"
                            key={player.userId}
                            onClick={() => handleSelectPlayer(player)}
                            disabled={player.hasCashedOut}
                            className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                              selected
                                ? 'border-sx-cyan bg-sx-cyan/15 text-sx-cyan/70'
                                : player.hasCashedOut
                                  ? 'border-sx-border bg-sx-bg/50 text-sx-muted cursor-not-allowed'
                                  : 'border-sx-border bg-sx-bg/60 text-zinc-100 hover:border-sx-cyan/40 hover:bg-sx-card'
                            }`}
                          >
                            <p className="font-semibold">{player.name}</p>
                            <p className="mt-0.5 text-[11px] text-sx-muted">
                              Stack: {formatChips(player.currentStack)} • Investido: {formatCurrency(player.chipsIn)}
                              {player.hasCashedOut ? ' • Cashout' : ''}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {participants.candidates.length > 0 && (
                    <div className="mt-3 flex flex-col gap-2 border-t border-sx-border pt-3 sm:flex-row">
                      <select
                        value={addCandidateId}
                        onChange={(e) => setAddCandidateId(e.target.value)}
                        className="flex-1 rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none"
                      >
                        <option value="">Inserir jogador do home game...</option>
                        {participants.candidates.map((c) => (
                          <option key={c.userId} value={c.userId}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!addCandidateId}
                        onClick={handleAddCandidate}
                        className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-bold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
                      >
                        Selecionar
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <form onSubmit={handleRegisterSale} className="rounded-xl border border-sx-border bg-sx-card p-4 space-y-3">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Registrar venda</h3>
                    {saleForm.sessionUserId ? (
                      <div className="rounded-lg border border-sx-cyan/30 bg-sx-cyan/10 px-3 py-2 text-xs text-sx-cyan/80">
                        Jogador selecionado: <span className="font-semibold">{saleForm.playerName || '—'}</span>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                        Selecione um jogador na lista acima antes de registrar a venda.
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[11px] uppercase tracking-wide text-sx-muted">Fichas</label>
                        <input type="number" min="0" step="0.01" value={saleForm.chips} onChange={(e) => setSaleForm((prev) => ({ ...prev, chips: e.target.value }))} className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] uppercase tracking-wide text-sx-muted">Pagamento</label>
                        <select value={saleForm.paymentMethod} onChange={(e) => setSaleForm((prev) => ({ ...prev, paymentMethod: e.target.value as PaymentMethod }))} className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none">
                          <option value="PIX_QR">PIX QR</option>
                          <option value="VOUCHER">Vale</option>
                          <option value="CASH">Dinheiro</option>
                          <option value="CARD">Cartao</option>
                        </select>
                      </div>
                    </div>
                    <input type="text" value={saleForm.paymentReference} onChange={(e) => setSaleForm((prev) => ({ ...prev, paymentReference: e.target.value }))} placeholder="Referencia pagamento (opcional)" className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none" />
                    <input type="text" value={saleForm.note} onChange={(e) => setSaleForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Observacao (opcional)" className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none" />
                    <button type="submit" disabled={loading || !saleForm.sessionUserId} className="w-full rounded-lg bg-sx-cyan py-2.5 text-sm font-bold text-sx-bg hover:bg-sx-cyan disabled:opacity-50">Registrar venda</button>
                  </form>

                  <div className="space-y-4">
                    <form onSubmit={handleReload} className="rounded-xl border border-sx-border bg-sx-card p-4 space-y-3">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Reforco do caixa</h3>
                      <input type="number" min="0" step="0.01" value={reloadForm.chips} onChange={(e) => setReloadForm((prev) => ({ ...prev, chips: e.target.value }))} placeholder="Fichas recebidas" className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none" />
                      <input type="text" value={reloadForm.note} onChange={(e) => setReloadForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Observacao" className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none" />
                      <button type="submit" disabled={loading} className="w-full rounded-lg border border-cyan-500/40 bg-cyan-500/10 py-2.5 text-sm font-bold text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50">Registrar reforco</button>
                    </form>

                    <form onSubmit={handleCloseShift} className="rounded-xl border border-sx-border bg-sx-card p-4 space-y-3">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Encerrar turno</h3>
                      <input type="number" min="0" step="0.01" value={closeForm.returnedChips} onChange={(e) => setCloseForm((prev) => ({ ...prev, returnedChips: e.target.value }))} placeholder="Fichas devolvidas ao caixa" className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none" />
                      <input type="text" value={closeForm.note} onChange={(e) => setCloseForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Observacao de fechamento" className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-cyan focus:outline-none" />
                      <button type="submit" disabled={loading} className="w-full rounded-lg border border-red-500/40 bg-red-500/10 py-2.5 text-sm font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50">Encerrar turno</button>
                    </form>
                  </div>
                </div>

                {pendingVoucherGroups.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-amber-200">Vales pendentes</h3>
                    <div className="mt-2 space-y-2">
                      {pendingVoucherGroups.map((group) => (
                        <div key={group.key} className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-sx-card/60 p-3 md:flex-row md:items-center md:justify-between">
                          <p className="text-sm text-zinc-100">
                            {group.playerName} • {formatChips(group.totalChips)} fichas • {formatCurrency(group.totalAmount)}
                            {group.saleIds.length > 1 ? ` • ${group.saleIds.length} vales` : ''}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handlePrintVoucher(group.latestSaleId)}
                              className="rounded-md border border-sx-border bg-white/5 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-white/10"
                            >
                              Imprimir vale
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSettleVoucherGroup(group.saleIds)}
                              className="rounded-md border border-sx-cyan/40 bg-sx-cyan/15 px-3 py-1.5 text-xs font-bold text-sx-cyan hover:bg-sx-cyan/25"
                            >
                              Liquidar vale
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-sx-border bg-sx-card p-4">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Ultimas vendas</h3>
                    <div className="mt-3 space-y-2 max-h-72 overflow-auto pr-1">
                      {activeShift.sales.length === 0 ? (
                        <p className="text-sm text-sx-muted">Sem vendas registradas.</p>
                      ) : activeShift.sales.map((sale) => (
                        <div key={sale.id} className="rounded-lg border border-sx-border bg-sx-bg/60 p-2.5 text-xs">
                          <p className="font-semibold text-zinc-100">{sale.paymentMethod} • {sale.paymentStatus}</p>
                          <p className="text-sx-muted">{formatChips(sale.chips)} fichas • {formatCurrency(Number(sale.amount))}</p>
                          {sale.playerName && <p className="text-sx-muted">Jogador: {sale.playerName}</p>}
                          {sale.voucherCode && <p className="text-amber-300">Vale: {sale.voucherCode}</p>}
                          {sale.paymentMethod === 'VOUCHER' && (
                            <button
                              type="button"
                              onClick={() => handlePrintVoucher(sale.id)}
                              className="mt-2 rounded-md border border-sx-border bg-white/5 px-2.5 py-1 text-[11px] font-bold text-zinc-200 hover:bg-white/10"
                            >
                              Imprimir vale
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-sx-border bg-sx-card p-4">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Movimentacoes de fichas</h3>
                    <div className="mt-3 space-y-2 max-h-72 overflow-auto pr-1">
                      {activeShift.movements.length === 0 ? (
                        <p className="text-sm text-sx-muted">Sem movimentacoes registradas.</p>
                      ) : activeShift.movements.map((movement) => (
                        <div key={movement.id} className="rounded-lg border border-sx-border bg-sx-bg/60 p-2.5 text-xs">
                          <p className="font-semibold text-zinc-100">{movement.type}</p>
                          <p className="text-sx-muted">{formatChips(movement.chips)} fichas</p>
                          {movement.note && <p className="text-sx-muted">{movement.note}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal PIX QR */}
      {pixQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-w-md rounded-2xl border border-sx-border bg-sx-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-100">QR Code PIX</h2>
              <button
                onClick={() => setPixQrModal(null)}
                className="text-sx-muted hover:text-zinc-100"
              >
                ✕
              </button>
            </div>

            {pixQrModal.qrCodeBase64 && (
              <div className="flex justify-center bg-white p-4 rounded-lg">
                {/* QR code base64 — <Image> do next/image não otimiza data URIs */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${pixQrModal.qrCodeBase64}`}
                  alt="QR Code PIX"
                  className="w-48 h-48"
                />
              </div>
            )}

            {pixQrModal.pixCopyPaste && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-sx-muted">Codigo de copia</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-sx-input px-3 py-2 text-xs font-mono text-cyan-300 break-all">
                    {pixQrModal.pixCopyPaste}
                  </code>
                  <button
                    onClick={() => {
                      if (!pixQrModal?.pixCopyPaste) return
                      navigator.clipboard.writeText(pixQrModal.pixCopyPaste)
                      setSuccess('Codigo copiado para a area de transferencia')
                    }}
                    className="rounded-lg bg-sx-cyan px-3 py-2 text-xs font-bold text-sx-bg hover:bg-sx-cyan"
                  >
                    Copiar
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => setPixQrModal(null)}
              className="w-full rounded-lg bg-sx-input py-2.5 text-sm font-bold text-zinc-100 hover:bg-sx-border2"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {closingReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-sx-border bg-sx-card p-5 text-zinc-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-sx-cyan">Relatorio de Encerramento</h2>
                <p className="text-xs text-sx-muted">Turno: {closingReportModal.shift.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setClosingReportModal(null)}
                className="rounded-md border border-sx-border2 px-3 py-1 text-sm hover:bg-sx-input"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-sx-border bg-sx-bg/60 p-3">
                <p className="text-[11px] uppercase tracking-wide text-sx-muted">Total vendido</p>
                <p className="mt-1 text-base font-black">{formatCurrency(closingReportModal.finance.totalSalesAmount)}</p>
              </div>
              <div className="rounded-lg border border-sx-border bg-sx-bg/60 p-3">
                <p className="text-[11px] uppercase tracking-wide text-sx-muted">Pago</p>
                <p className="mt-1 text-base font-black text-sx-cyan">{formatCurrency(closingReportModal.finance.paidAmount)}</p>
              </div>
              <div className="rounded-lg border border-sx-border bg-sx-bg/60 p-3">
                <p className="text-[11px] uppercase tracking-wide text-sx-muted">Pendente</p>
                <p className="mt-1 text-base font-black text-amber-300">{formatCurrency(closingReportModal.finance.pendingAmount)}</p>
              </div>
              <div className="rounded-lg border border-sx-border bg-sx-bg/60 p-3">
                <p className="text-[11px] uppercase tracking-wide text-sx-muted">Saldo fichas</p>
                <p className="mt-1 text-base font-black text-cyan-300">{formatChips(closingReportModal.inventory.closingBalanceChips)}</p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-sx-border bg-sx-bg/60 p-3">
              <p className="text-xs text-zinc-300">
                Operador: <span className="font-semibold">{closingReportModal.operator.name || closingReportModal.operator.username}</span> • Sessao: {closingReportModal.session.id}
              </p>
              <p className="mt-1 text-xs text-sx-muted">
                Fechado em: {closingReportModal.shift.closedAt ? new Date(closingReportModal.shift.closedAt).toLocaleString('pt-BR') : '-'}
              </p>
            </div>

            {closingReportModal.pendingSales.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-amber-200">Pendencias abertas</h3>
                <div className="mt-2 space-y-1">
                  {closingReportModal.pendingSales.map((sale) => (
                    <p key={sale.saleId} className="text-xs text-zinc-100">
                      {sale.paymentMethod} • {sale.playerName || 'Jogador'} • {formatCurrency(sale.amount)}
                      {sale.voucherCode ? ` • ${sale.voucherCode}` : ''}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => handlePrintClosingReport(closingReportModal)}
                className="rounded-lg bg-sx-cyan px-4 py-2 text-sm font-bold text-sx-bg hover:bg-sx-cyan"
              >
                Imprimir relatorio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
