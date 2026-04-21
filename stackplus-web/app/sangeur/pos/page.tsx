'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useSangeurAuthStore } from '@/store/useStore'
import { getErrorMessage } from '@/lib/errors'
import { getStringByPaths } from '@/lib/payload'

type PaymentMethod = 'PIX_QR' | 'VOUCHER' | 'CASH' | 'CARD'
type FinancialModule = 'POSTPAID' | 'PREPAID' | 'HYBRID'
type Tab = 'VENDA' | 'REFORCO' | 'FECHAR'

interface OperationalSession {
  id: string
  status: 'WAITING' | 'ACTIVE' | 'FINISHED'
  createdAt: string
  chipValue: number
  financialModule?: FinancialModule
  openShiftId?: string | null
  _count: { playerStates: number; transactions: number }
}

interface SessionPlayer {
  userId: string
  name: string
  paymentMode?: 'POSTPAID' | 'PREPAID' | null
  chipsIn: number
  currentStack: number
  hasCashedOut: boolean
}

interface SessionCandidate {
  userId: string
  name: string
  paymentMode?: 'POSTPAID' | 'PREPAID' | null
}

interface ParticipantsPayload {
  players: SessionPlayer[]
  candidates: SessionCandidate[]
}

interface ShiftDetail {
  id: string
  sessionId: string
  status: 'OPEN' | 'CLOSED'
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
  sales: Array<{
    id: string
    chips: string | number
    amount: string | number
    paymentMethod: PaymentMethod
    paymentStatus: 'PENDING' | 'PAID' | 'CANCELED'
    playerName?: string | null
    createdAt: string
  }>
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
    ['data', 'qrCodeBase64'],
  ])
  if (!raw) return null
  if (raw.startsWith('data:image')) return raw
  return `data:image/png;base64,${raw}`
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
    ['data', 'copiaECola'],
  ])
}

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatChips(value: string | number) {
  return Number(value || 0).toLocaleString('pt-BR')
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  PIX_QR: 'PIX',
  CASH: 'Dinheiro',
  CARD: 'Cartão',
  VOUCHER: 'Vale',
}

export default function SangeurPosPage() {
  const router = useRouter()
  const token = useSangeurAuthStore((s) => s.token)
  const user = useSangeurAuthStore((s) => s.user)
  const sangeur = useSangeurAuthStore((s) => s.sangeur)
  const logoutSangeur = useSangeurAuthStore((s) => s.logoutSangeur)

  const [sessions, setSessions] = useState<OperationalSession[]>([])
  const [activeShift, setActiveShift] = useState<ShiftDetail | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [participants, setParticipants] = useState<ParticipantsPayload>({ players: [], candidates: [] })

  const [tab, setTab] = useState<Tab>('VENDA')
  const [openShiftForm, setOpenShiftForm] = useState({ sessionId: '', initialChips: '', note: '' })
  const [selectedPlayer, setSelectedPlayer] = useState<SessionPlayer | SessionCandidate | null>(null)
  const [saleForm, setSaleForm] = useState({ chips: '', paymentMethod: 'PIX_QR' as PaymentMethod, note: '', paymentReference: '' })
  const [reloadForm, setReloadForm] = useState({ chips: '', note: '' })
  const [closeForm, setCloseForm] = useState({ returnedChips: '', note: '' })
  const [addCandidateId, setAddCandidateId] = useState('')
  const [showHeaderInfo, setShowHeaderInfo] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  // Payload da cobrança PIX ANNAPAY (shape varia entre endpoints).
  const [pixQrModal, setPixQrModal] = useState<{
    qrCodeBase64?: string
    pixCopyPaste?: string
    [key: string]: unknown
  } | null>(null)
  const [pixSaleId, setPixSaleId] = useState<string | null>(null)
  const [pixStatusMsg, setPixStatusMsg] = useState('')
  const [confirmingPix, setConfirmingPix] = useState(false)

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
    if (sangeur.mustChangePassword) {
      router.replace('/sangeur')
      return
    }
    loadOperational()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, sangeur])

  useEffect(() => {
    if (activeShift?.sessionId) loadParticipants(activeShift.sessionId)
    else setParticipants({ players: [], candidates: [] })
  }, [activeShift?.sessionId])

  useEffect(() => {
    setSaleForm((prev) => (prev.paymentMethod === defaultPaymentMethod ? prev : { ...prev, paymentMethod: defaultPaymentMethod }))
  }, [defaultPaymentMethod, activeShift?.id])

  useEffect(() => {
    if (!error && !success) return
    const t = setTimeout(() => {
      setError('')
      setSuccess('')
    }, 3000)
    return () => clearTimeout(t)
  }, [error, success])

  // Polling automático do status PIX
  useEffect(() => {
    if (!pixQrModal || !pixSaleId) return
    let stopped = false

    const poll = async () => {
      if (stopped) return
      try {
        const { data } = await api.post(`/sangeur/sales/${pixSaleId}/settle-pix`, {})
        if (data.settled) {
          stopped = true
          setPixQrModal(null)
          setPixSaleId(null)
          setPixStatusMsg('')
          setSuccess('Pagamento PIX confirmado!')
          await loadOperational()
          if (activeShift?.sessionId) loadParticipants(activeShift.sessionId)
          return
        }
        if (!stopped) setPixStatusMsg(data.message || 'Aguardando pagamento...')
      } catch {
        // silencia erros de polling
      }
    }

    poll()
    const timer = setInterval(poll, 5000)
    return () => { stopped = true; clearInterval(timer) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixQrModal, pixSaleId])

  async function handleConfirmPixManual() {
    if (!pixSaleId) return
    setConfirmingPix(true)
    try {
      const { data } = await api.post(`/sangeur/sales/${pixSaleId}/settle-pix`, { manual: true })
      if (data.settled) {
        setPixQrModal(null)
        setPixSaleId(null)
        setPixStatusMsg('')
        setSuccess('Pagamento confirmado manualmente')
        await loadOperational()
        if (activeShift?.sessionId) loadParticipants(activeShift.sessionId)
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Falha ao confirmar pagamento'))
    } finally {
      setConfirmingPix(false)
    }
  }

  async function loadOperational() {
    if (!sangeur) return
    setLoadingData(true)
    try {
      const { data } = await api.get(`/sangeur/home-games/${sangeur.homeGameId}/sessions`)
      const list: OperationalSession[] = Array.isArray(data) ? data : []
      setSessions(list)
      const openSession = list.find((s) => s.openShiftId)
      if (openSession?.openShiftId) {
        const shiftResponse = await api.get(`/sangeur/shifts/${openSession.openShiftId}`)
        setActiveShift(shiftResponse.data)
      } else {
        setActiveShift(null)
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Falha ao carregar dados'))
    } finally {
      setLoadingData(false)
    }
  }

  async function loadParticipants(sessionId: string) {
    try {
      const { data } = await api.get<ParticipantsPayload>(`/sangeur/sessions/${sessionId}/participants`)
      setParticipants({
        players: Array.isArray(data?.players) ? data.players : [],
        candidates: Array.isArray(data?.candidates) ? data.candidates : [],
      })
    } catch {
      setParticipants({ players: [], candidates: [] })
    }
  }

  async function handleOpenShift(e: React.FormEvent) {
    e.preventDefault()
    if (!sangeur) return
    if (!openShiftForm.sessionId) return setError('Selecione uma sessão')
    const initialChips = Number(openShiftForm.initialChips || 0)
    if (initialChips < 0) return setError('Fichas iniciais inválidas')

    setLoading(true)
    try {
      const { data } = await api.post('/sangeur/shifts/open', {
        homeGameId: sangeur.homeGameId,
        sessionId: openShiftForm.sessionId,
        initialChips,
        note: openShiftForm.note || undefined,
      })
      setActiveShift(data)
      setOpenShiftForm({ sessionId: '', initialChips: '', note: '' })
      setSuccess('Turno aberto')
      await loadOperational()
    } catch (err) {
      setError(getErrorMessage(err, 'Falha ao abrir turno'))
    } finally {
      setLoading(false)
    }
  }

  async function handleRegisterSale(e: React.FormEvent) {
    e.preventDefault()
    if (!activeShift || !selectedPlayer) return
    const chips = Number(saleForm.chips || 0)
    if (chips <= 0) return setError('Informe as fichas')

    setLoading(true)
    try {
      const { data } = await api.post(`/sangeur/shifts/${activeShift.id}/sales`, {
        chips,
        paymentMethod: saleForm.paymentMethod,
        sessionUserId: selectedPlayer.userId,
        playerName: selectedPlayer.name,
        note: saleForm.note || undefined,
        paymentReference: saleForm.paymentReference || undefined,
      })
      const shiftData = data.shift || data
      const pixData = data.pixQrData
      setActiveShift(shiftData)
      setSaleForm({ chips: '', paymentMethod: defaultPaymentMethod, note: '', paymentReference: '' })
      setSelectedPlayer(null)
      if (shiftData?.sessionId) loadParticipants(shiftData.sessionId)
      if (pixData) {
        setPixQrModal(pixData)
        setPixSaleId(data.sale?.id || null)
        setPixStatusMsg('Aguardando pagamento...')
      }
      setSuccess('Venda registrada')
    } catch (err) {
      setError(getErrorMessage(err, 'Falha ao registrar venda'))
    } finally {
      setLoading(false)
    }
  }

  function handleAddCandidate() {
    if (!addCandidateId) return
    const candidate = participants.candidates.find((c) => c.userId === addCandidateId)
    if (!candidate) return
    setSelectedPlayer(candidate)
    setAddCandidateId('')
  }

  async function handleReload(e: React.FormEvent) {
    e.preventDefault()
    if (!activeShift) return
    const chips = Number(reloadForm.chips || 0)
    if (chips <= 0) return setError('Informe as fichas')
    setLoading(true)
    try {
      const { data } = await api.post(`/sangeur/shifts/${activeShift.id}/reload`, {
        chips,
        note: reloadForm.note || undefined,
      })
      setActiveShift(data)
      setReloadForm({ chips: '', note: '' })
      setSuccess('Reforço registrado')
      setTab('VENDA')
    } catch (err) {
      setError(getErrorMessage(err, 'Falha no reforço'))
    } finally {
      setLoading(false)
    }
  }

  async function handleCloseShift(e: React.FormEvent) {
    e.preventDefault()
    if (!activeShift) return
    const returnedChips = Number(closeForm.returnedChips || 0)
    if (returnedChips < 0) return setError('Devolução inválida')
    if (!confirm('Encerrar turno? Essa ação não pode ser desfeita.')) return
    setLoading(true)
    try {
      await api.post(`/sangeur/shifts/${activeShift.id}/close`, {
        returnedChips,
        note: closeForm.note || undefined,
      })
      setActiveShift(null)
      setCloseForm({ returnedChips: '', note: '' })
      setSuccess('Turno encerrado')
      await loadOperational()
    } catch (err) {
      setError(getErrorMessage(err, 'Falha ao encerrar'))
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    logoutSangeur()
    router.replace('/sangeur/login')
  }

  if (!token || !sangeur) return null

  const chipValue = Number(activeShift?.session?.chipValue || activeShift?.session?.homeGame?.chipValue || 0)
  const availablePayments: PaymentMethod[] = ['PIX_QR', 'CASH', 'CARD', 'VOUCHER']

  return (
    <div className="min-h-screen bg-sx-card text-zinc-100">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-sx-bg shadow-2xl shadow-black/40">
      {/* Header compacto */}
      <div className="sticky top-0 z-20 border-b border-sx-border bg-sx-bg/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => setShowHeaderInfo((v) => !v)}
            className="flex items-center gap-2 text-left"
          >
            <span className="text-xl font-black tracking-tight text-sx-cyan">SANGEUR</span>
            <span className="text-sx-muted">▾</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-sx-border2 px-3 py-2 text-xs font-bold text-zinc-200 active:bg-sx-input"
          >
            Sair
          </button>
        </div>
        {showHeaderInfo && (
          <div className="border-t border-sx-border bg-sx-card px-4 py-3 text-xs text-sx-muted">
            <p>Home Game: {sangeur.homeGameName}</p>
            <p>Usuário: @{sangeur.username}</p>
            <p>Operadora: {user?.name}</p>
          </div>
        )}

        {activeShift && (
          <div className="grid grid-cols-2 gap-px border-t border-sx-border bg-sx-input">
            <div className="bg-sx-bg px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-sx-muted">Saldo</p>
              <p className="text-2xl font-black text-sx-cyan">{formatChips(activeShift.summary.availableChips)}</p>
              <p className="text-[10px] text-sx-muted">fichas</p>
            </div>
            <div className="bg-sx-bg px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-sx-muted">Vendido</p>
              <p className="text-2xl font-black text-zinc-100">{formatCurrency(activeShift.summary.totalSalesAmount)}</p>
              <p className="text-[10px] text-sx-muted">{formatChips(activeShift.summary.soldChips)} fichas</p>
            </div>
          </div>
        )}
      </div>

      {/* Alertas */}
      {(error || success) && (
        <div className="px-4 pt-3">
          {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
          {success && <div className="rounded-lg border border-sx-cyan/30 bg-sx-cyan/10 p-3 text-sm text-sx-cyan">{success}</div>}
        </div>
      )}

      {/* Conteúdo */}
      <div className="px-4 py-4 pb-32">
        {loadingData && <p className="text-sm text-sx-muted">Carregando...</p>}

        {/* Abrir turno */}
        {!loadingData && !activeShift && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              Nenhum turno aberto. Selecione uma sessão e informe as fichas iniciais.
            </div>
            <form onSubmit={handleOpenShift} className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-sx-muted">Sessão</label>
                <select
                  value={openShiftForm.sessionId}
                  onChange={(e) => setOpenShiftForm((p) => ({ ...p, sessionId: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-sx-border2 bg-sx-card px-4 py-4 text-base focus:border-sx-cyan focus:outline-none"
                >
                  <option value="">Selecione...</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {new Date(s.createdAt).toLocaleDateString('pt-BR')} • {s.status} • {s._count.playerStates} jog.
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-sx-muted">Fichas iniciais</label>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={openShiftForm.initialChips}
                  onChange={(e) => setOpenShiftForm((p) => ({ ...p, initialChips: e.target.value.replace(/\D/g, '') }))}
                  className="mt-1 w-full rounded-lg border border-sx-border2 bg-sx-card px-4 py-4 text-2xl font-bold focus:border-sx-cyan focus:outline-none"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-sx-muted">Observação</label>
                <input
                  type="text"
                  value={openShiftForm.note}
                  onChange={(e) => setOpenShiftForm((p) => ({ ...p, note: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-sx-border2 bg-sx-card px-4 py-3 text-sm focus:border-sx-cyan focus:outline-none"
                  placeholder="Opcional"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-sx-cyan py-4 text-lg font-black text-sx-bg active:bg-sx-cyan disabled:opacity-50"
              >
                {loading ? 'Abrindo...' : 'Abrir turno'}
              </button>
            </form>
          </div>
        )}

        {/* Turno aberto */}
        {activeShift && (
          <>
            {tab === 'VENDA' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Toque no jogador</h2>
                  <span className="text-[10px] uppercase text-sx-muted">{isPostpaidSession ? 'Pós • default Vale' : 'Pré-pago'}</span>
                </div>

                {participants.players.length === 0 && (
                  <p className="rounded-lg border border-sx-border bg-sx-card p-4 text-sm text-sx-muted">
                    Nenhum jogador na sessão. Adicione abaixo.
                  </p>
                )}

                <div className="space-y-2">
                  {participants.players.map((p) => (
                    <button
                      key={p.userId}
                      type="button"
                      disabled={p.hasCashedOut}
                      onClick={() => setSelectedPlayer(p)}
                      className={`w-full rounded-xl border px-4 py-4 text-left transition-colors ${
                        p.hasCashedOut
                          ? 'border-sx-border bg-sx-bg/50 text-sx-muted'
                          : 'border-sx-border bg-sx-card text-zinc-100 active:border-sx-cyan active:bg-sx-cyan/10'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-base font-bold">{p.name}</p>
                        <p className="shrink-0 text-sm font-bold text-sx-cyan">{formatChips(p.currentStack)}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-sx-muted">
                        Investido: {formatCurrency(p.chipsIn)}{p.hasCashedOut ? ' • Cashout' : ''}
                      </p>
                    </button>
                  ))}
                </div>

                {participants.candidates.length > 0 && (
                  <div className="mt-4 space-y-2 rounded-xl border border-sx-border bg-sx-card p-3">
                    <p className="text-xs uppercase tracking-wide text-sx-muted">Inserir jogador</p>
                    <div className="flex gap-2">
                      <select
                        value={addCandidateId}
                        onChange={(e) => setAddCandidateId(e.target.value)}
                        className="flex-1 rounded-lg border border-sx-border2 bg-sx-input px-3 py-3 text-sm"
                      >
                        <option value="">Selecione...</option>
                        {participants.candidates.map((c) => (
                          <option key={c.userId} value={c.userId}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAddCandidate}
                        disabled={!addCandidateId}
                        className="rounded-lg bg-sx-cyan px-4 font-bold text-sx-bg active:bg-sx-cyan disabled:opacity-50"
                      >
                        OK
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'REFORCO' && (
              <form onSubmit={handleReload} className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Reforço do caixa</h2>
                <p className="text-xs text-sx-muted">Fichas adicionais recebidas do caixa principal durante o turno.</p>
                <div>
                  <label className="text-xs uppercase tracking-wide text-sx-muted">Fichas recebidas</label>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={reloadForm.chips}
                    onChange={(e) => setReloadForm((p) => ({ ...p, chips: e.target.value.replace(/\D/g, '') }))}
                    className="mt-1 w-full rounded-lg border border-sx-border2 bg-sx-card px-4 py-4 text-2xl font-bold focus:border-cyan-400 focus:outline-none"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-sx-muted">Observação</label>
                  <input
                    type="text"
                    value={reloadForm.note}
                    onChange={(e) => setReloadForm((p) => ({ ...p, note: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-sx-border2 bg-sx-card px-4 py-3 text-sm focus:border-cyan-400 focus:outline-none"
                    placeholder="Opcional"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-cyan-500 py-4 text-lg font-black text-sx-bg active:bg-cyan-400 disabled:opacity-50"
                >
                  {loading ? 'Registrando...' : 'Registrar reforço'}
                </button>
              </form>
            )}

            {tab === 'FECHAR' && (
              <form onSubmit={handleCloseShift} className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-300">Encerrar turno</h2>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-sx-border bg-sx-card p-3">
                    <p className="text-[10px] uppercase text-sx-muted">Iniciais</p>
                    <p className="text-lg font-bold">{formatChips(activeShift.summary.initialChips)}</p>
                  </div>
                  <div className="rounded-lg border border-sx-border bg-sx-card p-3">
                    <p className="text-[10px] uppercase text-sx-muted">Reforço</p>
                    <p className="text-lg font-bold text-cyan-300">{formatChips(activeShift.summary.reloadedChips)}</p>
                  </div>
                  <div className="rounded-lg border border-sx-border bg-sx-card p-3">
                    <p className="text-[10px] uppercase text-sx-muted">Vendidas</p>
                    <p className="text-lg font-bold text-amber-300">{formatChips(activeShift.summary.soldChips)}</p>
                  </div>
                  <div className="rounded-lg border border-sx-border bg-sx-card p-3">
                    <p className="text-[10px] uppercase text-sx-muted">Saldo atual</p>
                    <p className="text-lg font-bold text-sx-cyan">{formatChips(activeShift.summary.availableChips)}</p>
                  </div>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-sx-muted">Fichas devolvidas ao caixa</label>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={closeForm.returnedChips}
                    onChange={(e) => setCloseForm((p) => ({ ...p, returnedChips: e.target.value.replace(/\D/g, '') }))}
                    className="mt-1 w-full rounded-lg border border-sx-border2 bg-sx-card px-4 py-4 text-2xl font-bold focus:border-red-400 focus:outline-none"
                    placeholder={String(activeShift.summary.availableChips || 0)}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-sx-muted">Observação</label>
                  <input
                    type="text"
                    value={closeForm.note}
                    onChange={(e) => setCloseForm((p) => ({ ...p, note: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-sx-border2 bg-sx-card px-4 py-3 text-sm focus:border-red-400 focus:outline-none"
                    placeholder="Opcional"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg border-2 border-red-500 bg-red-500/20 py-4 text-lg font-black text-red-200 active:bg-red-500/40 disabled:opacity-50"
                >
                  {loading ? 'Encerrando...' : 'Encerrar turno'}
                </button>
                <p className="text-center text-xs text-sx-muted">
                  O relatório completo fica disponível na versão desktop da POS.
                </p>
              </form>
            )}
          </>
        )}
      </div>

      {/* Tab bar inferior */}
      {activeShift && (
        <div className="sticky bottom-0 z-20 mt-auto grid grid-cols-3 border-t border-sx-border bg-sx-bg">
          {(['VENDA', 'REFORCO', 'FECHAR'] as Tab[]).map((t) => {
            const active = tab === t
            const color = t === 'FECHAR' ? 'text-red-300' : t === 'REFORCO' ? 'text-cyan-300' : 'text-sx-cyan'
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`py-4 text-sm font-black uppercase tracking-wide transition-colors ${
                  active ? `${color} border-t-2 ${t === 'FECHAR' ? 'border-red-400' : t === 'REFORCO' ? 'border-cyan-400' : 'border-sx-cyan'} bg-sx-card` : 'text-sx-muted'
                }`}
              >
                {t === 'REFORCO' ? 'Reforço' : t === 'FECHAR' ? 'Fechar' : 'Venda'}
              </button>
            )
          })}
        </div>
      )}

      {/* Bottom sheet venda */}
      {selectedPlayer && activeShift && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60" onClick={() => setSelectedPlayer(null)}>
          <div
            className="w-full max-w-[430px] rounded-t-2xl border-t border-sx-border2 bg-sx-card p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-sx-border2" />
            <div className="mb-4 flex items-baseline justify-between">
              <div>
                <p className="text-[10px] uppercase text-sx-muted">Venda para</p>
                <p className="text-xl font-black">{selectedPlayer.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlayer(null)}
                className="rounded-lg border border-sx-border2 px-3 py-2 text-xs"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleRegisterSale} className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-sx-muted">Fichas</label>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoFocus
                  value={saleForm.chips}
                  onChange={(e) => setSaleForm((p) => ({ ...p, chips: e.target.value.replace(/\D/g, '') }))}
                  className="mt-1 w-full rounded-lg border border-sx-border2 bg-sx-bg px-4 py-4 text-3xl font-black focus:border-sx-cyan focus:outline-none"
                  placeholder="0"
                />
                {chipValue > 0 && saleForm.chips && (
                  <p className="mt-1 text-sm text-sx-muted">
                    Valor: <span className="font-bold text-sx-cyan">{formatCurrency(Number(saleForm.chips) * chipValue)}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs uppercase tracking-wide text-sx-muted">Pagamento</label>
                <div className="mt-1 grid grid-cols-4 gap-2">
                  {availablePayments.map((m) => {
                    const active = saleForm.paymentMethod === m
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSaleForm((p) => ({ ...p, paymentMethod: m }))}
                        className={`rounded-lg border px-2 py-3 text-xs font-bold transition-colors ${
                          active ? 'border-sx-cyan bg-sx-cyan/20 text-sx-cyan/80' : 'border-sx-border2 bg-sx-bg text-sx-muted'
                        }`}
                      >
                        {PAYMENT_LABELS[m]}
                      </button>
                    )
                  })}
                </div>
              </div>

              {(saleForm.paymentMethod === 'PIX_QR' || saleForm.paymentMethod === 'CARD') && (
                <div>
                  <label className="text-xs uppercase tracking-wide text-sx-muted">Referência (opcional)</label>
                  <input
                    type="text"
                    value={saleForm.paymentReference}
                    onChange={(e) => setSaleForm((p) => ({ ...p, paymentReference: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-sx-border2 bg-sx-bg px-4 py-3 text-sm focus:border-sx-cyan focus:outline-none"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !saleForm.chips}
                className="w-full rounded-lg bg-sx-cyan py-4 text-lg font-black text-sx-bg active:bg-sx-cyan disabled:opacity-50"
              >
                {loading ? 'Registrando...' : 'Registrar venda'}
              </button>
            </form>
          </div>
        </div>
      )}
      </div>

      {/* Modal PIX QR */}
      {pixQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-[400px] rounded-2xl border border-sx-border2 bg-sx-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-zinc-100">QR Code PIX</h2>
              <button
                type="button"
                onClick={() => setPixQrModal(null)}
                className="rounded-lg border border-sx-border2 px-3 py-2 text-xs font-bold text-zinc-300 active:bg-sx-input"
              >
                ✕ Fechar
              </button>
            </div>

            {(() => {
              const qrImg = extractPixQrImage(pixQrModal)
              const copyPaste = extractPixCopyPaste(pixQrModal)
              return (
                <>
                  {qrImg && (
                    <div className="flex justify-center rounded-xl bg-white p-4">
                      {/* QR code data-URI/base64 — <Image> do next/image não otimiza esses casos */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrImg} alt="QR Code PIX" className="h-52 w-52" />
                    </div>
                  )}
                  {copyPaste && (
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-sx-muted">PIX Copia e Cola</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 break-all rounded-lg bg-sx-input px-3 py-2 text-xs font-mono text-cyan-300">
                          {copyPaste}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(copyPaste)
                            setSuccess('Código copiado')
                          }}
                          className="shrink-0 rounded-lg bg-sx-cyan px-3 py-3 text-xs font-black text-sx-bg active:bg-sx-cyan"
                        >
                          Copiar
                        </button>
                      </div>
                    </div>
                  )}
                  {!qrImg && !copyPaste && (
                    <p className="text-sm text-sx-muted text-center">QR code não disponível</p>
                  )}
                </>
              )
            })()}

            {pixStatusMsg && (
              <p className="text-center text-sm text-sx-muted animate-pulse">{pixStatusMsg}</p>
            )}

            <button
              type="button"
              onClick={handleConfirmPixManual}
              disabled={confirmingPix}
              className="w-full rounded-lg bg-sx-cyan py-4 text-base font-black text-sx-bg active:bg-sx-cyan disabled:opacity-50"
            >
              {confirmingPix ? 'Confirmando...' : 'Confirmar pagamento'}
            </button>

            <button
              type="button"
              onClick={() => { setPixQrModal(null); setPixSaleId(null); setPixStatusMsg('') }}
              className="w-full rounded-lg bg-sx-input py-3 text-sm font-bold text-zinc-100 active:bg-sx-border2"
            >
              Fechar (manter pendente)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
