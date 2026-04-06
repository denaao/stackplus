'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useSangeurAuthStore } from '@/store/useStore'

type PaymentMethod = 'PIX_QR' | 'VOUCHER' | 'CASH' | 'CARD'

interface OperationalSession {
  id: string
  status: 'WAITING' | 'ACTIVE' | 'FINISHED'
  createdAt: string
  startedAt?: string | null
  chipValue: number
  openShiftId?: string | null
  _count: { playerStates: number; transactions: number }
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

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmNewPassword: '' })
  const [openShiftForm, setOpenShiftForm] = useState({ sessionId: '', initialChips: '', note: '' })
  const [saleForm, setSaleForm] = useState({ chips: '', paymentMethod: 'PIX_QR' as PaymentMethod, playerName: '', note: '', paymentReference: '' })
  const [reloadForm, setReloadForm] = useState({ chips: '', note: '' })
  const [closeForm, setCloseForm] = useState({ returnedChips: '', note: '' })

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [pixQrModal, setPixQrModal] = useState<any>(null)
  const [closingReportModal, setClosingReportModal] = useState<ClosingReportData | null>(null)

  const pendingVoucherSales = useMemo(
    () => activeShift?.sales.filter((sale) => sale.paymentMethod === 'VOUCHER' && sale.paymentStatus === 'PENDING') || [],
    [activeShift]
  )

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
      } catch (err: any) {
        setError(typeof err === 'string' ? err : 'Nao foi possivel carregar os dados operacionais')
      } finally {
        setLoadingData(false)
      }
    }

    loadOperationalData()
  }, [token, sangeur, router])

  async function refreshShift(shiftId: string) {
    const { data } = await api.get(`/sangeur/shifts/${shiftId}`)
    setActiveShift(data)
    return data as ShiftDetail
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
    } catch (err: any) {
      setError(typeof err === 'string' ? err : 'Nao foi possivel alterar a senha')
    } finally {
      setLoading(false)
    }
  }

  async function handleOpenShift(e: React.FormEvent) {
    e.preventDefault()
    if (!sangeur) return

    setError('')
    setSuccess('')

    if (!openShiftForm.sessionId) {
      setError('Selecione uma sessao para abrir o turno.')
      return
    }

    const initialChips = Number(openShiftForm.initialChips || 0)
    if (initialChips < 0) {
      setError('Quantidade inicial de fichas invalida.')
      return
    }

    setLoading(true)
    try {
      const { data } = await api.post('/sangeur/shifts/open', {
        homeGameId: sangeur.homeGameId,
        sessionId: openShiftForm.sessionId,
        initialChips,
        note: openShiftForm.note || undefined,
      })

      setActiveShift(data)
      setSuccess('Turno da SANGEUR aberto com sucesso.')
      setOpenShiftForm({ sessionId: '', initialChips: '', note: '' })

      const sessionsResponse = await api.get(`/sangeur/home-games/${sangeur.homeGameId}/sessions`)
      setSessions(Array.isArray(sessionsResponse.data) ? sessionsResponse.data : [])
    } catch (err: any) {
      setError(typeof err === 'string' ? err : 'Nao foi possivel abrir o turno')
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

    setLoading(true)
    try {
      const { data } = await api.post(`/sangeur/shifts/${activeShift.id}/sales`, {
        chips,
        paymentMethod: saleForm.paymentMethod,
        playerName: saleForm.playerName || undefined,
        note: saleForm.note || undefined,
        paymentReference: saleForm.paymentReference || undefined,
      })

      // Handle response which can be shift or {shift, pixQrData}
      const shiftData = data.shift || data
      const pixData = data.pixQrData

      setActiveShift(shiftData)
      setSaleForm({ chips: '', paymentMethod: 'PIX_QR', playerName: '', note: '', paymentReference: '' })
      
      // Show PIX QR modal if available
      if (pixData) {
        setPixQrModal(pixData)
      }
      
      setSuccess('Venda registrada com sucesso.')
    } catch (err: any) {
      setError(typeof err === 'string' ? err : 'Nao foi possivel registrar a venda')
    } finally {
      setLoading(false)
    }
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
    } catch (err: any) {
      setError(typeof err === 'string' ? err : 'Nao foi possivel registrar o reforco')
    } finally {
      setLoading(false)
    }
  }

  async function handlePrintVoucher(saleId: string) {
    setError('')

    try {
      const { data } = await api.get<VoucherReceiptData>(`/sangeur/sales/${saleId}/voucher-receipt`)
      const issuedAt = new Date(data.createdAt).toLocaleString('pt-BR')
      const settledAt = data.settledAt ? new Date(data.settledAt).toLocaleString('pt-BR') : '-'
      const playerName = data.playerName || 'Jogador nao informado'
      const operatorName = data.operator.name || data.operator.username
      const voucherCode = data.voucherCode || 'SEM-CODIGO'
      const note = data.note ? escapeHtml(data.note) : '-'
      const reference = data.paymentReference ? escapeHtml(data.paymentReference) : '-'

      const printHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Felipeta ${escapeHtml(voucherCode)}</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      body { font-family: Consolas, 'Courier New', monospace; color: #000; margin: 0; padding: 0; }
      .ticket { width: 72mm; border: 1px dashed #444; padding: 8px; }
      .center { text-align: center; }
      .title { font-size: 15px; font-weight: 700; margin: 0; }
      .muted { color: #333; font-size: 11px; }
      .divider { border-top: 1px dashed #444; margin: 8px 0; }
      .line { display: flex; justify-content: space-between; font-size: 12px; margin: 2px 0; gap: 8px; }
      .code { font-size: 16px; font-weight: 700; letter-spacing: 0.8px; }
      .value { font-size: 17px; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="ticket">
      <p class="title center">VALE SANGEUR</p>
      <p class="center muted">${escapeHtml(data.homeGame.name)}</p>
      <div class="divider"></div>
      <p class="center code">${escapeHtml(voucherCode)}</p>
      <div class="divider"></div>
      <div class="line"><span>Jogador</span><span>${escapeHtml(playerName)}</span></div>
      <div class="line"><span>Fichas</span><span>${formatChips(data.chips)}</span></div>
      <div class="line"><span>Valor da ficha</span><span>${formatCurrency(data.chipValue)}</span></div>
      <div class="line"><span>Total</span><span class="value">${formatCurrency(data.amount)}</span></div>
      <div class="line"><span>Status</span><span>${escapeHtml(data.paymentStatus)}</span></div>
      <div class="line"><span>Operador</span><span>${escapeHtml(operatorName)}</span></div>
      <div class="line"><span>Emitido em</span><span>${escapeHtml(issuedAt)}</span></div>
      <div class="line"><span>Liquidado em</span><span>${escapeHtml(settledAt)}</span></div>
      <div class="line"><span>Referencia</span><span>${reference}</span></div>
      <div class="line"><span>Obs.</span><span>${note}</span></div>
      <div class="divider"></div>
      <p class="center muted">Guarde este comprovante.</p>
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
    } catch (err: any) {
      setError(typeof err === 'string' ? err : 'Nao foi possivel gerar a felipeta do vale')
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
    } catch (err: any) {
      setError(typeof err === 'string' ? err : 'Nao foi possivel liquidar o vale')
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
    } catch (err: any) {
      setError(typeof err === 'string' ? err : 'Nao foi possivel encerrar o turno')
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
    <div className="min-h-screen bg-zinc-950 px-4 py-6">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-emerald-300">SANGEUR POS</h1>
              <p className="mt-1 text-sm text-zinc-400">Home Game: {sangeur.homeGameName}</p>
              <p className="text-xs text-zinc-500">Usuario POS: @{sangeur.username} • Operadora: {user?.name}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-200 hover:bg-zinc-800"
            >
              Sair
            </button>
          </div>
        </div>

        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
        {success && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{success}</div>}

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
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm focus:border-emerald-400 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-300">Nova senha</label>
                <input
                  type="password"
                  required
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm focus:border-emerald-400 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-300">Confirmar nova senha</label>
                <input
                  type="password"
                  required
                  value={passwordForm.confirmNewPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmNewPassword: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm focus:border-emerald-400 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-emerald-500 py-3 font-bold text-zinc-900 transition-colors hover:bg-emerald-400 disabled:opacity-50"
              >
                {loading ? 'Atualizando...' : 'Atualizar senha e liberar POS'}
              </button>
            </form>
          </div>
        ) : (
          <>
            {!activeShift && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                <h2 className="text-lg font-bold">Abrir turno da SANGEUR</h2>
                <p className="mt-1 text-xs text-zinc-500">Selecione a sessao ativa/aguardando e informe as fichas recebidas do caixa.</p>

                {loadingData ? (
                  <p className="mt-4 text-sm text-zinc-500">Carregando sessoes...</p>
                ) : (
                  <form onSubmit={handleOpenShift} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs uppercase tracking-wide text-zinc-400">Sessao</label>
                      <select
                        value={openShiftForm.sessionId}
                        onChange={(e) => setOpenShiftForm((prev) => ({ ...prev, sessionId: e.target.value }))}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                      >
                        <option value="">Selecione...</option>
                        {sessions.map((session) => (
                          <option key={session.id} value={session.id}>
                            {new Date(session.createdAt).toLocaleDateString('pt-BR')} • {session.status} • {session._count.playerStates} jogadores
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs uppercase tracking-wide text-zinc-400">Fichas iniciais</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={openShiftForm.initialChips}
                        onChange={(e) => setOpenShiftForm((prev) => ({ ...prev, initialChips: e.target.value }))}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs uppercase tracking-wide text-zinc-400">Observacao</label>
                      <input
                        type="text"
                        value={openShiftForm.note}
                        onChange={(e) => setOpenShiftForm((prev) => ({ ...prev, note: e.target.value }))}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                        placeholder="Opcional"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="md:col-span-4 rounded-lg bg-emerald-500 py-3 font-bold text-zinc-900 transition-colors hover:bg-emerald-400 disabled:opacity-50"
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
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Fichas iniciais</p>
                    <p className="mt-1 text-lg font-black text-zinc-100">{formatChips(activeShift.summary.initialChips)}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Reforco</p>
                    <p className="mt-1 text-lg font-black text-cyan-300">{formatChips(activeShift.summary.reloadedChips)}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Vendidas</p>
                    <p className="mt-1 text-lg font-black text-amber-300">{formatChips(activeShift.summary.soldChips)}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Saldo disponivel</p>
                    <p className="mt-1 text-lg font-black text-emerald-300">{formatChips(activeShift.summary.availableChips)}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500">Total vendido</p>
                    <p className="mt-1 text-lg font-black text-zinc-100">{formatCurrency(activeShift.summary.totalSalesAmount)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <form onSubmit={handleRegisterSale} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Registrar venda</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[11px] uppercase tracking-wide text-zinc-500">Fichas</label>
                        <input type="number" min="0" step="0.01" value={saleForm.chips} onChange={(e) => setSaleForm((prev) => ({ ...prev, chips: e.target.value }))} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] uppercase tracking-wide text-zinc-500">Pagamento</label>
                        <select value={saleForm.paymentMethod} onChange={(e) => setSaleForm((prev) => ({ ...prev, paymentMethod: e.target.value as PaymentMethod }))} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none">
                          <option value="PIX_QR">PIX QR</option>
                          <option value="VOUCHER">Vale</option>
                          <option value="CASH">Dinheiro</option>
                          <option value="CARD">Cartao</option>
                        </select>
                      </div>
                    </div>
                    <input type="text" value={saleForm.playerName} onChange={(e) => setSaleForm((prev) => ({ ...prev, playerName: e.target.value }))} placeholder="Nome do jogador (opcional)" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
                    <input type="text" value={saleForm.paymentReference} onChange={(e) => setSaleForm((prev) => ({ ...prev, paymentReference: e.target.value }))} placeholder="Referencia pagamento (opcional)" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
                    <input type="text" value={saleForm.note} onChange={(e) => setSaleForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Observacao (opcional)" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
                    <button type="submit" disabled={loading} className="w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-bold text-zinc-900 hover:bg-emerald-400 disabled:opacity-50">Registrar venda</button>
                  </form>

                  <div className="space-y-4">
                    <form onSubmit={handleReload} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Reforco do caixa</h3>
                      <input type="number" min="0" step="0.01" value={reloadForm.chips} onChange={(e) => setReloadForm((prev) => ({ ...prev, chips: e.target.value }))} placeholder="Fichas recebidas" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
                      <input type="text" value={reloadForm.note} onChange={(e) => setReloadForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Observacao" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
                      <button type="submit" disabled={loading} className="w-full rounded-lg border border-cyan-500/40 bg-cyan-500/10 py-2.5 text-sm font-bold text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50">Registrar reforco</button>
                    </form>

                    <form onSubmit={handleCloseShift} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Encerrar turno</h3>
                      <input type="number" min="0" step="0.01" value={closeForm.returnedChips} onChange={(e) => setCloseForm((prev) => ({ ...prev, returnedChips: e.target.value }))} placeholder="Fichas devolvidas ao caixa" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
                      <input type="text" value={closeForm.note} onChange={(e) => setCloseForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Observacao de fechamento" className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" />
                      <button type="submit" disabled={loading} className="w-full rounded-lg border border-red-500/40 bg-red-500/10 py-2.5 text-sm font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-50">Encerrar turno</button>
                    </form>
                  </div>
                </div>

                {pendingVoucherSales.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-amber-200">Vales pendentes</h3>
                    <div className="mt-2 space-y-2">
                      {pendingVoucherSales.map((sale) => (
                        <div key={sale.id} className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-zinc-900/60 p-3 md:flex-row md:items-center md:justify-between">
                          <p className="text-sm text-zinc-100">
                            {sale.playerName || 'Jogador'} • {formatChips(sale.chips)} fichas • {formatCurrency(Number(sale.amount))}
                            {sale.voucherCode ? ` • ${sale.voucherCode}` : ''}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handlePrintVoucher(sale.id)}
                              className="rounded-md border border-zinc-500/40 bg-zinc-500/10 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-500/20"
                            >
                              Imprimir vale
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSettleVoucher(sale.id)}
                              className="rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
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
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Ultimas vendas</h3>
                    <div className="mt-3 space-y-2 max-h-72 overflow-auto pr-1">
                      {activeShift.sales.length === 0 ? (
                        <p className="text-sm text-zinc-500">Sem vendas registradas.</p>
                      ) : activeShift.sales.map((sale) => (
                        <div key={sale.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5 text-xs">
                          <p className="font-semibold text-zinc-100">{sale.paymentMethod} • {sale.paymentStatus}</p>
                          <p className="text-zinc-400">{formatChips(sale.chips)} fichas • {formatCurrency(Number(sale.amount))}</p>
                          {sale.playerName && <p className="text-zinc-500">Jogador: {sale.playerName}</p>}
                          {sale.voucherCode && <p className="text-amber-300">Vale: {sale.voucherCode}</p>}
                          {sale.paymentMethod === 'VOUCHER' && (
                            <button
                              type="button"
                              onClick={() => handlePrintVoucher(sale.id)}
                              className="mt-2 rounded-md border border-zinc-500/40 bg-zinc-500/10 px-2.5 py-1 text-[11px] font-bold text-zinc-200 hover:bg-zinc-500/20"
                            >
                              Imprimir vale
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Movimentacoes de fichas</h3>
                    <div className="mt-3 space-y-2 max-h-72 overflow-auto pr-1">
                      {activeShift.movements.length === 0 ? (
                        <p className="text-sm text-zinc-500">Sem movimentacoes registradas.</p>
                      ) : activeShift.movements.map((movement) => (
                        <div key={movement.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5 text-xs">
                          <p className="font-semibold text-zinc-100">{movement.type}</p>
                          <p className="text-zinc-400">{formatChips(movement.chips)} fichas</p>
                          {movement.note && <p className="text-zinc-500">{movement.note}</p>}
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
          <div className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-100">QR Code PIX</h2>
              <button
                onClick={() => setPixQrModal(null)}
                className="text-zinc-400 hover:text-zinc-100"
              >
                ✕
              </button>
            </div>

            {pixQrModal.qrCodeBase64 && (
              <div className="flex justify-center bg-white p-4 rounded-lg">
                <img
                  src={`data:image/png;base64,${pixQrModal.qrCodeBase64}`}
                  alt="QR Code PIX"
                  className="w-48 h-48"
                />
              </div>
            )}

            {pixQrModal.pixCopyPaste && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Codigo de copia</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-mono text-cyan-300 break-all">
                    {pixQrModal.pixCopyPaste}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(pixQrModal.pixCopyPaste)
                      setSuccess('Codigo copiado para a area de transferencia')
                    }}
                    className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-zinc-900 hover:bg-emerald-400"
                  >
                    Copiar
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => setPixQrModal(null)}
              className="w-full rounded-lg bg-zinc-800 py-2.5 text-sm font-bold text-zinc-100 hover:bg-zinc-700"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {closingReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-zinc-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-emerald-300">Relatorio de Encerramento</h2>
                <p className="text-xs text-zinc-400">Turno: {closingReportModal.shift.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setClosingReportModal(null)}
                className="rounded-md border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-800"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Total vendido</p>
                <p className="mt-1 text-base font-black">{formatCurrency(closingReportModal.finance.totalSalesAmount)}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Pago</p>
                <p className="mt-1 text-base font-black text-emerald-300">{formatCurrency(closingReportModal.finance.paidAmount)}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Pendente</p>
                <p className="mt-1 text-base font-black text-amber-300">{formatCurrency(closingReportModal.finance.pendingAmount)}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Saldo fichas</p>
                <p className="mt-1 text-base font-black text-cyan-300">{formatChips(closingReportModal.inventory.closingBalanceChips)}</p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
              <p className="text-xs text-zinc-300">
                Operador: <span className="font-semibold">{closingReportModal.operator.name || closingReportModal.operator.username}</span> • Sessao: {closingReportModal.session.id}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
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
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-zinc-900 hover:bg-emerald-400"
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
