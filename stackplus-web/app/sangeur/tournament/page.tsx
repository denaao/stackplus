'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useSangeurAuthStore } from '@/store/useStore'
import { getErrorMessage } from '@/lib/errors'

type PaymentMethod = 'PIX_QR' | 'CASH' | 'CARD' | 'VOUCHER'
type ActionType = 'BUYIN' | 'REBUY' | 'ADDON'

interface TournamentSummary {
  id: string
  name: string
  status: 'REGISTRATION' | 'RUNNING' | 'ON_BREAK' | 'FINISHED'
  buyInAmount: string | number
  rebuyAmount: string | number | null
  addonAmount: string | number | null
  buyInTaxAmount: string | number | null
  rebuyTaxAmount: string | number | null
  addonTaxAmount: string | number | null
  canLateReg: boolean
  canRebuy: boolean
  canAddon: boolean
  _count: { players: number }
}

interface TournamentPlayer {
  id: string
  status: 'REGISTERED' | 'ACTIVE' | 'ELIMINATED' | 'WINNER'
  rebuysCount: number
  hasAddon: boolean
  player: { id: string; name: string }
}

interface Candidate {
  userId: string
  name: string
}

interface TournamentDetail {
  tournament: TournamentSummary
  players: TournamentPlayer[]
  candidates: Candidate[]
}

interface ShiftSale {
  id: string
  amount: string | number
  paymentMethod: PaymentMethod
  paymentStatus: 'PENDING' | 'PAID' | 'CANCELED'
  paymentReference?: string | null
  playerName?: string | null
  actionType?: string | null
  tournamentId?: string | null
  createdAt: string
}

interface ShiftDetail {
  id: string
  eventId: string
  status: 'OPEN' | 'CLOSED'
  openedAt: string
  closedAt?: string | null
  note?: string | null
  event?: { id: string; name: string } | null
  summary: {
    totalSalesAmount: number
    paidAmount: number
    pendingAmount: number
  }
  sales: ShiftSale[]
}

interface OpenShift {
  id: string
  openedAt: string
}

interface HomeData {
  tournaments: TournamentSummary[]
  openShift: OpenShift | null
}

function fmt(v: string | number | null | undefined) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function statusLabel(s: string) {
  if (s === 'REGISTRATION') return { label: 'Inscrições', color: 'text-green-400' }
  if (s === 'RUNNING') return { label: 'Em Andamento', color: 'text-sx-cyan' }
  if (s === 'ON_BREAK') return { label: 'Intervalo', color: 'text-yellow-400' }
  return { label: s, color: 'text-white/40' }
}

function actionLabel(a: ActionType) {
  if (a === 'BUYIN') return 'Buy-in'
  if (a === 'REBUY') return 'Rebuy'
  return 'Add-on'
}

const CARD_STYLE = {
  background: 'linear-gradient(135deg, #0C2438 0%, #071828 60%, #050D15 100%)',
  border: '1px solid rgba(0,200,224,0.15)',
}

export default function SangeurTournamentPage() {
  const router = useRouter()
  const token = useSangeurAuthStore((s) => s.token)
  const sangeur = useSangeurAuthStore((s) => s.sangeur)
  const logoutSangeur = useSangeurAuthStore((s) => s.logoutSangeur)

  // ── State ──────────────────────────────────────────────────────────────────
  const [view, setView] = useState<'home' | 'tournament' | 'action'>('home')
  const [homeData, setHomeData] = useState<HomeData | null>(null)
  const [shiftDetail, setShiftDetail] = useState<ShiftDetail | null>(null)
  const [tournamentDetail, setTournamentDetail] = useState<TournamentDetail | null>(null)

  const [actionType, setActionType] = useState<ActionType>('BUYIN')
  const [selectedPlayer, setSelectedPlayer] = useState<TournamentPlayer | null>(null)
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [buyInType, setBuyInType] = useState<'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE'>('NORMAL')
  const [rebuyType, setRebuyType] = useState<'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE'>('NORMAL')
  const [withAddonTax, setWithAddonTax] = useState(false)
  const [playerSearch, setPlayerSearch] = useState('')

  const [loading, setLoading] = useState(false)
  const [loadingHome, setLoadingHome] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [actionSheet, setActionSheet] = useState<{
    player?: TournamentPlayer
    candidate?: Candidate
  } | null>(null)

  const [pixModal, setPixModal] = useState<{
    qrCodeBase64?: string
    pixCopyPaste?: string
    [key: string]: unknown
  } | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)

  // ── Assinatura (voucher) ────────────────────────────────────────────────────
  const [signatureModal, setSignatureModal] = useState(false)
  const [pendingVoucherBody, setPendingVoucherBody] = useState<Record<string, unknown> | null>(null)
  const [hasSignature, setHasSignature] = useState(false)
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const lastPosRef = useRef<{ x: number; y: number } | null>(null)

  // ── Auth guard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !sangeur?.eventId) {
      router.replace('/sangeur/tournament/login')
    }
  }, [token, sangeur, router])

  const eventId = sangeur?.eventId ?? ''

  // ── Load home data ─────────────────────────────────────────────────────────
  const loadHome = useCallback(async () => {
    if (!eventId) return
    setLoadingHome(true)
    try {
      const { data } = await api.get<HomeData>(`/sangeur/events/${eventId}/tournaments`)
      setHomeData(data)
      if (data.openShift) {
        const { data: shift } = await api.get<ShiftDetail>(`/sangeur/tournament-shifts/${data.openShift.id}`)
        setShiftDetail(shift)
      } else {
        setShiftDetail(null)
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao carregar torneios'))
    } finally {
      setLoadingHome(false)
    }
  }, [eventId])

  useEffect(() => { loadHome() }, [loadHome])

  // ── Auto-refresh: poll every 30s so novos torneios aparecem sem refresh manual
  useEffect(() => {
    if (!eventId) return
    const interval = setInterval(() => { loadHome() }, 30_000)
    return () => clearInterval(interval)
  }, [eventId, loadHome])

  // ── Auto-limpa mensagens após 4s ───────────────────────────────────────────
  useEffect(() => {
    if (!success && !error) return
    const t = setTimeout(() => { setSuccess(''); setError('') }, 4000)
    return () => clearTimeout(t)
  }, [success, error])

  // ── Helpers ────────────────────────────────────────────────────────────────
  function clearMsg() { setError(''); setSuccess('') }

  async function handleOpenShift() {
    clearMsg()
    setLoading(true)
    try {
      await api.post('/sangeur/tournament-shifts/open', { eventId })
      await loadHome()
      setSuccess('Turno aberto com sucesso!')
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao abrir turno'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectTournament(t: TournamentSummary) {
    if (!shiftDetail) return
    clearMsg()
    setLoading(true)
    try {
      const { data } = await api.get<TournamentDetail>(
        `/sangeur/tournament-shifts/${shiftDetail.id}/tournaments/${t.id}/players`
      )
      setTournamentDetail(data)
      setView('tournament')
      setPlayerSearch('')
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao carregar torneio'))
    } finally {
      setLoading(false)
    }
  }

  function startAction(type: ActionType, player?: TournamentPlayer, candidate?: Candidate) {
    clearMsg()
    setActionType(type)
    setSelectedPlayer(player ?? null)
    setSelectedCandidate(candidate ?? null)
    setBuyInType('NORMAL')
    setRebuyType('NORMAL')
    setWithAddonTax(false)
    setPaymentMethod('CASH')
    setView('action')
  }

  async function submitTournamentSale(body: Record<string, unknown>) {
    if (!shiftDetail || !tournamentDetail) return
    setLoading(true)
    try {
      const { data } = await api.post(
        `/sangeur/tournament-shifts/${shiftDetail.id}/sales`,
        body,
      )

      if (paymentMethod === 'PIX_QR' && data.pixQrData) {
        setPixModal(data.pixQrData)
      } else {
        setSuccess(`${actionLabel(actionType)} registrado — ${fmt(data.amount)}`)
        setView('tournament')
        const { data: updated } = await api.get<TournamentDetail>(
          `/sangeur/tournament-shifts/${shiftDetail.id}/tournaments/${tournamentDetail.tournament.id}/players`
        )
        setTournamentDetail(updated)
      }
      const { data: updatedShift } = await api.get<ShiftDetail>(`/sangeur/tournament-shifts/${shiftDetail.id}`)
      setShiftDetail(updatedShift)
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao registrar'))
    } finally {
      setLoading(false)
    }
  }

  async function handleRegisterSale() {
    if (!shiftDetail || !tournamentDetail) return
    clearMsg()

    const body: Record<string, unknown> = {
      actionType,
      paymentMethod,
    }
    if (actionType === 'BUYIN') {
      const candidateId = selectedCandidate?.userId
      if (!candidateId) { setError('Selecione o jogador'); return }
      body.playerId = candidateId
      body.tournamentId = tournamentDetail.tournament.id
      body.buyInType = buyInType
    } else {
      if (!selectedPlayer) { setError('Selecione o jogador'); return }
      body.tournamentPlayerId = selectedPlayer.id
      if (actionType === 'REBUY') body.rebuyType = rebuyType
      if (actionType === 'ADDON') body.withAddonTax = withAddonTax
    }

    // Voucher: exige assinatura antes de efetivar
    if (paymentMethod === 'VOUCHER') {
      setPendingVoucherBody(body)
      setHasSignature(false)
      setSignatureModal(true)
      setTimeout(() => {
        const canvas = signatureCanvasRef.current
        if (canvas) {
          const ctx = canvas.getContext('2d')
          ctx?.clearRect(0, 0, canvas.width, canvas.height)
        }
      }, 50)
      return
    }

    await submitTournamentSale(body)
  }

  async function handleConfirmPix(saleId?: string) {
    if (!saleId) return
    try {
      await api.post(`/sangeur/sales/${saleId}/settle-pix`, { manual: true })
      setPixModal(null)
      setSuccess('Pagamento PIX confirmado!')
      setView('tournament')
      if (shiftDetail && tournamentDetail) {
        const [{ data: updatedShift }, { data: updatedPlayers }] = await Promise.all([
          api.get<ShiftDetail>(`/sangeur/tournament-shifts/${shiftDetail.id}`),
          api.get<TournamentDetail>(
            `/sangeur/tournament-shifts/${shiftDetail.id}/tournaments/${tournamentDetail.tournament.id}/players`
          ),
        ])
        setShiftDetail(updatedShift)
        setTournamentDetail(updatedPlayers)
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao confirmar PIX'))
    }
  }

  async function handleCloseShift() {
    if (!shiftDetail) return
    clearMsg()
    setLoading(true)
    try {
      await api.post(`/sangeur/tournament-shifts/${shiftDetail.id}/close`, {})
      setConfirmClose(false)
      setShiftDetail(null)
      setView('home')
      await loadHome()
      setSuccess('Turno encerrado.')
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao encerrar turno'))
    } finally {
      setLoading(false)
    }
  }

  // ── Amount preview ─────────────────────────────────────────────────────────
  function previewAmount(): number {
    const t = tournamentDetail?.tournament
    if (!t) return 0
    if (actionType === 'BUYIN') {
      const base = Number(t.buyInAmount)
      const tax = buyInType === 'NORMAL_WITH_TAX' ? Number(t.buyInTaxAmount ?? 0) : 0
      const double = buyInType === 'DOUBLE' ? base : 0
      return base + tax + double
    }
    if (actionType === 'REBUY') {
      const base = Number(t.rebuyAmount ?? 0)
      const tax = rebuyType === 'NORMAL_WITH_TAX' ? Number(t.rebuyTaxAmount ?? 0) : 0
      const double = rebuyType === 'DOUBLE' ? base : 0
      return base + tax + double
    }
    // ADDON
    const base = Number(t.addonAmount ?? 0)
    const tax = withAddonTax ? Number(t.addonTaxAmount ?? 0) : 0
    return base + tax
  }

  // ── Filtered player list ───────────────────────────────────────────────────
  const filteredPlayers = (tournamentDetail?.players ?? []).filter((p) =>
    p.player.name.toLowerCase().includes(playerSearch.toLowerCase())
  )
  const filteredCandidates = (tournamentDetail?.candidates ?? []).filter((c) =>
    c.name.toLowerCase().includes(playerSearch.toLowerCase())
  )

  if (!token || !sangeur?.eventId) return null

  // ── Assinatura Modal (early return — funciona em qualquer view) ────────────
  if (signatureModal && pendingVoucherBody) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-sx-bg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-sx-border px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-sx-muted">Autorização de compra — Voucher</p>
            <p className="text-base font-black text-white">
              {selectedCandidate?.name ?? selectedPlayer?.player.name ?? ''}
            </p>
            <p className="text-sm text-sx-cyan font-bold">{actionLabel(actionType)}</p>
          </div>
          <button
            type="button"
            onClick={() => { setSignatureModal(false); setPendingVoucherBody(null) }}
            className="rounded-lg border border-sx-border2 px-3 py-2 text-xs font-bold text-white/60"
          >
            Cancelar
          </button>
        </div>

        {/* Instrução */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 text-center">
          <p className="text-sm font-bold text-amber-300">Assine abaixo para autorizar a transação</p>
          <p className="text-xs text-amber-400/70 mt-0.5">Voucher</p>
        </div>

        {/* Canvas */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 gap-4">
          <div
            className="relative w-full max-w-[430px] rounded-xl border-2 border-dashed border-sx-border2 bg-sx-card overflow-hidden"
            style={{ height: 220 }}
          >
            <canvas
              ref={signatureCanvasRef}
              width={800}
              height={440}
              style={{ width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' }}
              onPointerDown={(e) => {
                const canvas = signatureCanvasRef.current
                if (!canvas) return
                isDrawingRef.current = true
                const rect = canvas.getBoundingClientRect()
                const scaleX = canvas.width / rect.width
                const scaleY = canvas.height / rect.height
                lastPosRef.current = {
                  x: (e.clientX - rect.left) * scaleX,
                  y: (e.clientY - rect.top) * scaleY,
                }
                canvas.setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                if (!isDrawingRef.current) return
                const canvas = signatureCanvasRef.current
                if (!canvas || !lastPosRef.current) return
                const ctx = canvas.getContext('2d')
                if (!ctx) return
                const rect = canvas.getBoundingClientRect()
                const scaleX = canvas.width / rect.width
                const scaleY = canvas.height / rect.height
                const x = (e.clientX - rect.left) * scaleX
                const y = (e.clientY - rect.top) * scaleY
                ctx.beginPath()
                ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y)
                ctx.lineTo(x, y)
                ctx.strokeStyle = '#00C8E0'
                ctx.lineWidth = 3
                ctx.lineCap = 'round'
                ctx.lineJoin = 'round'
                ctx.stroke()
                lastPosRef.current = { x, y }
                setHasSignature(true)
              }}
              onPointerUp={() => { isDrawingRef.current = false; lastPosRef.current = null }}
            />
            {!hasSignature && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <p className="text-sm text-sx-muted/50 select-none">Assine aqui</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              const canvas = signatureCanvasRef.current
              if (canvas) {
                const ctx = canvas.getContext('2d')
                ctx?.clearRect(0, 0, canvas.width, canvas.height)
                setHasSignature(false)
              }
            }}
            className="text-xs text-sx-muted hover:text-white/60 underline"
          >
            Limpar assinatura
          </button>
        </div>

        {/* Confirmar */}
        <div className="border-t border-sx-border px-4 py-4">
          <button
            type="button"
            disabled={!hasSignature || loading}
            onClick={async () => {
              const canvas = signatureCanvasRef.current
              if (!canvas) return
              const signatureData = canvas.toDataURL('image/png')
              const bodyWithSig = { ...pendingVoucherBody, signatureData }
              setSignatureModal(false)
              setPendingVoucherBody(null)
              setHasSignature(false)
              await submitTournamentSale(bodyWithSig)
            }}
            className="w-full rounded-xl bg-sx-cyan py-4 text-lg font-black text-sx-bg disabled:opacity-40"
          >
            {loading ? 'Registrando...' : 'Confirmar e registrar'}
          </button>
        </div>
      </div>
    )
  }

  // ── PIX Modal ──────────────────────────────────────────────────────────────
  if (pixModal) {
    const qr = (pixModal.qrCodeBase64 as string | undefined)
      || (pixModal.imagemQrcode as string | undefined)
    const copyPaste = (pixModal.pixCopyPaste as string | undefined)
      || (pixModal.pixCopiaCola as string | undefined)
    // Try to find a saleId from recent sales
    const recentSale = shiftDetail?.sales.find((s) => s.paymentStatus === 'PENDING' && s.paymentMethod === 'PIX_QR')

    return (
      <div className="min-h-screen bg-sx-bg flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl p-6 space-y-4" style={CARD_STYLE}>
          <h2 className="text-lg font-bold text-white text-center">PIX — Aguardando pagamento</h2>
          {qr && (
            <div className="flex justify-center">
              <img src={`data:image/png;base64,${qr}`} alt="QR Code PIX" className="w-52 h-52 rounded-xl" />
            </div>
          )}
          {copyPaste && (
            <div className="space-y-1">
              <p className="text-xs text-sx-muted text-center">Pix Copia e Cola</p>
              <div
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-white/70 break-all cursor-pointer text-center"
                onClick={() => navigator.clipboard.writeText(copyPaste).catch(() => {})}
              >
                {copyPaste.slice(0, 48)}…
                <span className="block text-sx-cyan mt-1">Toque para copiar</span>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => handleConfirmPix(recentSale?.id)}
              className="flex-1 rounded-xl py-3 text-sm font-bold bg-green-500/20 border border-green-500/30 text-green-300 hover:bg-green-500/30 transition-colors"
            >
              ✓ Confirmar pagamento
            </button>
            <button
              onClick={() => { setPixModal(null); setView('tournament') }}
              className="flex-1 rounded-xl py-3 text-sm font-bold bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Action view ─────────────────────────────────────────────────────────────
  if (view === 'action' && tournamentDetail) {
    const t = tournamentDetail.tournament
    const hasTax =
      (actionType === 'BUYIN' && Number(t.buyInTaxAmount ?? 0) > 0) ||
      (actionType === 'REBUY' && Number(t.rebuyTaxAmount ?? 0) > 0) ||
      (actionType === 'ADDON' && Number(t.addonTaxAmount ?? 0) > 0)

    const playerName =
      actionType === 'BUYIN'
        ? (selectedCandidate?.name ?? '')
        : (selectedPlayer?.player.name ?? '')

    return (
      <div className="min-h-screen bg-sx-bg pb-8">
        {/* Header */}
        <header className="px-4 py-4 flex items-center gap-3" style={{
          background: 'linear-gradient(180deg, rgba(7,24,40,0.99) 0%, rgba(5,13,21,0.97) 100%)',
          borderBottom: '1px solid rgba(0,200,224,0.2)',
        }}>
          <button onClick={() => setView('tournament')} className="text-sx-muted hover:text-sx-cyan text-xl px-1">←</button>
          <div>
            <div className="font-bold text-white">{actionLabel(actionType)}</div>
            <div className="text-xs text-sx-muted">{t.name}</div>
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
          )}

          {/* Player */}
          <div className="rounded-xl p-4 space-y-1" style={CARD_STYLE}>
            <div className="text-xs text-sx-muted uppercase tracking-widest">Jogador</div>
            <div className="text-lg font-bold text-white">{playerName || '—'}</div>
            {actionType === 'REBUY' && selectedPlayer && (
              <div className="text-xs text-sx-muted">{selectedPlayer.rebuysCount} rebuy(s) anteriores</div>
            )}
            {actionType === 'ADDON' && selectedPlayer && (
              selectedPlayer.hasAddon
                ? <div className="text-xs text-red-400">Já fez add-on</div>
                : null
            )}
          </div>

          {/* Type options */}
          {actionType === 'BUYIN' && (
            <div className="rounded-xl p-4 space-y-2" style={CARD_STYLE}>
              <div className="text-xs text-sx-muted uppercase tracking-widest mb-2">Tipo de Buy-in</div>
              {(['NORMAL', ...(hasTax ? ['NORMAL_WITH_TAX'] : []), 'DOUBLE'] as ('NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE')[]).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setBuyInType(opt)}
                  className={`w-full text-left rounded-lg px-4 py-3 text-sm font-semibold border transition-colors ${
                    buyInType === opt
                      ? 'bg-sx-cyan/10 border-sx-cyan text-sx-cyan'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {opt === 'NORMAL' ? `Normal — ${fmt(t.buyInAmount)}`
                    : opt === 'NORMAL_WITH_TAX' ? `Com taxa — ${fmt(Number(t.buyInAmount) + Number(t.buyInTaxAmount ?? 0))}`
                    : `Double — ${fmt(Number(t.buyInAmount) * 2)}`}
                </button>
              ))}
            </div>
          )}

          {actionType === 'REBUY' && (
            <div className="rounded-xl p-4 space-y-2" style={CARD_STYLE}>
              <div className="text-xs text-sx-muted uppercase tracking-widest mb-2">Tipo de Rebuy</div>
              {(['NORMAL', ...(hasTax ? ['NORMAL_WITH_TAX'] : []), 'DOUBLE'] as ('NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE')[]).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setRebuyType(opt)}
                  className={`w-full text-left rounded-lg px-4 py-3 text-sm font-semibold border transition-colors ${
                    rebuyType === opt
                      ? 'bg-sx-cyan/10 border-sx-cyan text-sx-cyan'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {opt === 'NORMAL' ? `Normal — ${fmt(t.rebuyAmount)}`
                    : opt === 'NORMAL_WITH_TAX' ? `Com taxa — ${fmt(Number(t.rebuyAmount) + Number(t.rebuyTaxAmount ?? 0))}`
                    : `Double — ${fmt(Number(t.rebuyAmount ?? 0) * 2)}`}
                </button>
              ))}
            </div>
          )}

          {actionType === 'ADDON' && hasTax && (
            <div className="rounded-xl p-4" style={CARD_STYLE}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={withAddonTax}
                  onChange={(e) => setWithAddonTax(e.target.checked)}
                  className="w-4 h-4 accent-sx-cyan"
                />
                <span className="text-sm text-white">
                  Incluir taxa opcional — +{fmt(t.addonTaxAmount)}
                </span>
              </label>
            </div>
          )}

          {/* Payment method */}
          <div className="rounded-xl p-4 space-y-2" style={CARD_STYLE}>
            <div className="text-xs text-sx-muted uppercase tracking-widest mb-2">Pagamento</div>
            <div className="grid grid-cols-2 gap-2">
              {(['CASH', 'PIX_QR', 'CARD', 'VOUCHER'] as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`rounded-lg py-3 text-sm font-bold border transition-colors ${
                    paymentMethod === m
                      ? 'bg-sx-cyan/10 border-sx-cyan text-sx-cyan'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {m === 'CASH' ? '💵 Dinheiro'
                    : m === 'PIX_QR' ? '⚡ PIX'
                    : m === 'CARD' ? '💳 Cartão'
                    : '🎟 Voucher'}
                </button>
              ))}
            </div>
          </div>

          {/* Amount preview */}
          <div className="rounded-xl px-4 py-4 flex items-center justify-between" style={CARD_STYLE}>
            <span className="text-sm text-sx-muted">Total a cobrar</span>
            <span className="text-2xl font-black text-sx-cyan">{fmt(previewAmount())}</span>
          </div>

          <button
            onClick={handleRegisterSale}
            disabled={loading}
            className="w-full rounded-xl py-4 text-sx-bg font-black text-sm tracking-widest uppercase transition-opacity"
            style={{ background: 'linear-gradient(135deg, #00C8E0, #0077A8)' }}
          >
            {loading ? 'Registrando...' : `Confirmar ${actionLabel(actionType)}`}
          </button>
        </div>
      </div>
    )
  }

  // ── Tournament view ─────────────────────────────────────────────────────────
  if (view === 'tournament' && tournamentDetail) {
    const t = tournamentDetail.tournament
    const st = statusLabel(t.status)

    return (
      <div className="min-h-screen bg-sx-bg pb-8">
        {/* Header */}
        <header className="px-4 py-4 flex items-center gap-3" style={{
          background: 'linear-gradient(180deg, rgba(7,24,40,0.99) 0%, rgba(5,13,21,0.97) 100%)',
          borderBottom: '1px solid rgba(0,200,224,0.2)',
        }}>
          <button onClick={() => { setView('home'); loadHome() }} className="text-sx-muted hover:text-sx-cyan text-xl px-1">←</button>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-white truncate">{t.name}</div>
            <div className={`text-xs font-semibold ${st.color}`}>{st.label}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-sx-muted">Jogadores</div>
            <div className="text-xl font-black text-white">{tournamentDetail.players.length}</div>
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
          )}
          {success && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">{success}</div>
          )}

          {/* Search */}
          <input
            type="text"
            placeholder="Buscar jogador..."
            value={playerSearch}
            onChange={(e) => setPlayerSearch(e.target.value)}
            className="w-full rounded-lg border border-sx-border2 bg-sx-input px-4 py-2.5 text-sm focus:border-sx-cyan focus:outline-none"
          />

          {/* Registered players — tap to open action sheet */}
          {filteredPlayers.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-white/40 uppercase tracking-widest">Inscritos</div>
              {filteredPlayers.map((p) => {
                const isOut = p.status === 'ELIMINATED' || p.status === 'WINNER'
                const hasActions = (t.canRebuy && !isOut) || (t.canAddon && !p.hasAddon && !isOut)
                return (
                  <button
                    key={p.id}
                    onClick={() => setActionSheet({ player: p })}
                    className="w-full text-left rounded-xl px-4 py-3 transition-all active:scale-[0.98]"
                    style={{ ...CARD_STYLE, opacity: p.status === 'ELIMINATED' ? 0.55 : 1 }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{p.player.name}</div>
                        <div className="text-xs text-sx-muted mt-0.5 flex flex-wrap gap-x-2">
                          {p.rebuysCount > 0 && <span>{p.rebuysCount} rebuy{p.rebuysCount > 1 ? 's' : ''}</span>}
                          {p.hasAddon && <span>add-on ✓</span>}
                          {p.status === 'ELIMINATED' && <span className="text-red-400">Eliminado</span>}
                          {p.status === 'WINNER' && <span className="text-yellow-400">🏆 Vencedor</span>}
                        </div>
                      </div>
                      {hasActions && (
                        <span className="text-sx-cyan/50 text-lg shrink-0">›</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Candidates (can buy-in) */}
          {t.canLateReg && filteredCandidates.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-white/40 uppercase tracking-widest">Inscrever</div>
              {filteredCandidates.map((c) => (
                <button
                  key={c.userId}
                  onClick={() => setActionSheet({ candidate: c })}
                  className="w-full text-left rounded-xl px-4 py-3 flex items-center justify-between transition-all active:scale-[0.98]"
                  style={CARD_STYLE}
                >
                  <span className="text-sm text-white/70">{c.name}</span>
                  <span className="text-sx-cyan/50 text-lg">›</span>
                </button>
              ))}
            </div>
          )}

          {filteredPlayers.length === 0 && filteredCandidates.length === 0 && (
            <p className="text-center text-sm text-white/30 py-8">Nenhum jogador encontrado</p>
          )}

          {/* ── Action Sheet ─────────────────────────────────────────────── */}
          {actionSheet && tournamentDetail && (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center"
              style={{ background: 'rgba(0,0,0,0.6)' }}
              onClick={() => setActionSheet(null)}
            >
              <div
                className="w-full max-w-lg rounded-t-2xl p-5 space-y-3"
                style={{ background: 'linear-gradient(180deg,#0C2438 0%,#071828 100%)', border: '1px solid rgba(0,200,224,0.2)', borderBottom: 'none' }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Player name */}
                <div className="pb-1">
                  <p className="text-base font-bold text-white">
                    {actionSheet.candidate?.name ?? actionSheet.player?.player.name}
                  </p>
                  {actionSheet.player && (
                    <p className="text-xs text-sx-muted mt-0.5">
                      {actionSheet.player.rebuysCount > 0 && `${actionSheet.player.rebuysCount} rebuy(s) · `}
                      {actionSheet.player.hasAddon ? 'Add-on feito' : ''}
                      {actionSheet.player.status === 'ELIMINATED' ? 'Eliminado' : ''}
                      {actionSheet.player.status === 'WINNER' ? '🏆 Vencedor' : ''}
                    </p>
                  )}
                </div>

                {/* Actions */}
                {actionSheet.candidate && (
                  <button
                    onClick={() => { setActionSheet(null); startAction('BUYIN', undefined, actionSheet.candidate) }}
                    className="w-full rounded-xl py-3.5 text-sm font-bold bg-sx-cyan/15 border border-sx-cyan/30 text-sx-cyan hover:bg-sx-cyan/25 transition-colors"
                  >
                    Buy-in
                  </button>
                )}

                {actionSheet.player && (() => {
                  const p = actionSheet.player
                  const isOut = p.status === 'ELIMINATED' || p.status === 'WINNER'
                  const showRebuy = t.canRebuy && !isOut
                  const showAddon = t.canAddon && !p.hasAddon && !isOut
                  const hasAny = showRebuy || showAddon
                  return (
                    <>
                      {showRebuy && (
                        <button
                          onClick={() => { setActionSheet(null); startAction('REBUY', p) }}
                          className="w-full rounded-xl py-3.5 text-sm font-bold bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 transition-colors"
                        >
                          Rebuy
                        </button>
                      )}
                      {showAddon && (
                        <button
                          onClick={() => { setActionSheet(null); startAction('ADDON', p) }}
                          className="w-full rounded-xl py-3.5 text-sm font-bold bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 transition-colors"
                        >
                          Add-on
                        </button>
                      )}
                      {!hasAny && (
                        <p className="text-center text-sm text-white/30 py-2">Sem ações disponíveis para este jogador</p>
                      )}
                    </>
                  )
                })()}

                <button
                  onClick={() => setActionSheet(null)}
                  className="w-full rounded-xl py-3 text-sm text-white/40 hover:text-white/60 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Home view ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-sx-bg pb-8">
      {/* Header */}
      <header className="px-4 py-0" style={{
        background: 'linear-gradient(180deg, rgba(7,24,40,0.99) 0%, rgba(5,13,21,0.97) 100%)',
        borderBottom: '1px solid rgba(0,200,224,0.2)',
        minHeight: '64px',
      }}>
        <div className="max-w-lg mx-auto min-h-16 flex items-center gap-3">
          <div className="flex-1">
            <span className="text-xl font-black text-sx-cyan tracking-tight" style={{ textShadow: '0 0 20px rgba(0,200,224,0.75)' }}>
              STACK+
            </span>
            {sangeur?.eventName && (
              <div className="text-xs text-sx-muted truncate max-w-[200px]">{sangeur.eventName}</div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadHome()}
              disabled={loadingHome}
              className="text-xs text-sx-muted hover:text-sx-cyan transition-colors disabled:opacity-40"
              title="Atualizar"
            >
              ↻
            </button>
            <button
              onClick={() => { logoutSangeur(); router.push('/sangeur/tournament/login') }}
              className="text-xs text-sx-muted hover:text-red-400 transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-4">
        {loadingHome ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-sx-cyan/30 border-t-sx-cyan rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
            )}
            {success && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">{success}</div>
            )}

            {/* Shift status */}
            {shiftDetail ? (
              <div className="rounded-xl px-4 py-4" style={{
                background: 'linear-gradient(135deg, #0a2a10 0%, #051a08 100%)',
                border: '1px solid rgba(74,222,128,0.2)',
              }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-green-400/70 uppercase tracking-widest mb-0.5">Turno aberto</div>
                    <div className="text-sm font-bold text-green-300">
                      {new Date(shiftDetail.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-xs text-sx-muted mt-1">
                      {fmt(shiftDetail.summary.paidAmount)} recebido ·{' '}
                      {shiftDetail.sales.length} venda{shiftDetail.sales.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => setConfirmClose(true)}
                    className="rounded-lg px-4 py-2 text-xs font-bold bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 transition-colors"
                  >
                    Encerrar turno
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl p-4 text-center space-y-3" style={CARD_STYLE}>
                <p className="text-sm text-white/50">Nenhum turno aberto para este evento</p>
                <button
                  onClick={handleOpenShift}
                  disabled={loading}
                  className="rounded-xl px-6 py-3 text-sm font-black tracking-widest uppercase text-sx-bg transition-opacity"
                  style={{ background: 'linear-gradient(135deg, #00C8E0, #0077A8)' }}
                >
                  {loading ? 'Abrindo...' : 'Abrir Turno'}
                </button>
              </div>
            )}

            {/* Tournaments list */}
            {homeData && homeData.tournaments.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs text-white/40 uppercase tracking-widest">Torneios ativos</div>
                {homeData.tournaments.map((t) => {
                  const st = statusLabel(t.status)
                  return (
                    <button
                      key={t.id}
                      onClick={() => shiftDetail ? handleSelectTournament(t) : undefined}
                      disabled={!shiftDetail || loading}
                      className="w-full text-left rounded-xl px-4 py-4 transition-colors hover:border-sx-cyan/40 disabled:opacity-50"
                      style={CARD_STYLE}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-white truncate">{t.name}</div>
                          <div className={`text-xs font-semibold mt-0.5 ${st.color}`}>{st.label}</div>
                          <div className="text-xs text-sx-muted mt-1">
                            Buy-in: {fmt(t.buyInAmount)}
                            {t.rebuyAmount && ` · Rebuy: ${fmt(t.rebuyAmount)}`}
                            {t.addonAmount && ` · Add-on: ${fmt(t.addonAmount)}`}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs text-sx-muted">Jogadores</div>
                          <div className="text-xl font-black text-white">{t._count.players}</div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              !loadingHome && (
                <div className="text-center py-10 space-y-3">
                  <p className="text-sm text-white/30">Nenhum torneio ativo no momento</p>
                  <button
                    onClick={() => loadHome()}
                    className="text-xs text-sx-cyan/60 hover:text-sx-cyan transition-colors"
                  >
                    ↻ Atualizar
                  </button>
                </div>
              )
            )}
          </>
        )}
      </div>


      {/* Confirm close modal */}
      {confirmClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4" style={CARD_STYLE}>
            <h3 className="text-lg font-bold text-white">Encerrar turno?</h3>
            <p className="text-sm text-sx-muted">
              Todas as vendas pendentes permanecerão registradas. Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCloseShift}
                disabled={loading}
                className="flex-1 rounded-xl py-3 text-sm font-bold bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 transition-colors"
              >
                {loading ? 'Encerrando...' : 'Encerrar'}
              </button>
              <button
                onClick={() => setConfirmClose(false)}
                className="flex-1 rounded-xl py-3 text-sm font-bold bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
