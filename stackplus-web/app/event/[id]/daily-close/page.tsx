'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'
import AppHeader from '@/components/AppHeader'
import AppLoading from '@/components/AppLoading'
import EventTabs from '@/components/EventTabs'
import { getErrorMessage } from '@/lib/errors'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyClose {
  id: string
  date: string
  status: 'OPEN' | 'CLOSED'
  totalIn: string | null
  totalOut: string | null
  totalPix: string | null
  totalCash: string | null
  closedAt: string | null
  notes: string | null
  closedBy: { id: string; name: string } | null
}

interface LiveTotals {
  totalIn: string
  totalOut: string
  totalPix: string
  totalCash: string
}

interface LiveSummary {
  date: string
  totals: LiveTotals
  items: {
    id: string
    type: string
    amount: string
    description: string | null
    createdAt: string
    comanda: { player: { id: string; name: string } }
  }[]
}

interface Event {
  id: string
  name: string
  status: string
  host: { id: string }
  staff: { id: string; role: string; user: { id: string } }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(value: string | null | undefined): string {
  if (value == null) return 'R$ 0,00'
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function todayLocal(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

const TYPE_LABEL: Record<string, string> = {
  CASH_BUYIN: 'Buy-in cash',
  CASH_REBUY: 'Rebuy cash',
  CASH_ADDON: 'Add-on cash',
  CASH_CASHOUT: 'Cashout',
  TOURNAMENT_BUYIN: 'Buy-in torneio',
  TOURNAMENT_REBUY: 'Rebuy torneio',
  TOURNAMENT_ADDON: 'Add-on torneio',
  TOURNAMENT_PRIZE: 'Prêmio',
  TRANSFER_IN: 'Transferência (entrada)',
  TRANSFER_OUT: 'Transferência (saída)',
  PAYMENT_PIX_SPOT: 'Pagamento PIX à vista',
  PAYMENT_PIX_TERM: 'Pagamento PIX a prazo',
  PAYMENT_CASH: 'Pagamento dinheiro',
  PAYMENT_VOUCHER: 'Pagamento vale',
}

const IN_TYPES = new Set([
  'CASH_BUYIN', 'CASH_REBUY', 'CASH_ADDON',
  'TOURNAMENT_BUYIN', 'TOURNAMENT_REBUY', 'TOURNAMENT_ADDON',
  'TRANSFER_IN',
])
const OUT_TYPES = new Set(['CASH_CASHOUT', 'TOURNAMENT_PRIZE', 'TRANSFER_OUT'])

// ─── Component ────────────────────────────────────────────────────────────────

export default function DailyClosePage() {
  const router = useRouter()
  const params = useParams()
  const { user, logout } = useAuthStore()
  const eventId = params.id as string

  const [event, setEvent] = useState<Event | null>(null)
  const [closes, setCloses] = useState<DailyClose[]>([])
  const [loading, setLoading] = useState(true)

  // Selected date state
  const [selectedDate, setSelectedDate] = useState(todayLocal())
  const [summary, setSummary] = useState<LiveSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  // Active close record (created when user clicks "Abrir fechamento")
  const [activeClose, setActiveClose] = useState<DailyClose | null>(null)
  const [openingClose, setOpeningClose] = useState(false)

  // Close action
  const [notes, setNotes] = useState('')
  const [closing, setClosing] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  // Detail view
  const [viewingClose, setViewingClose] = useState<DailyClose | null>(null)

  function handleLogout() { logout(); router.push('/') }

  const isHost = !!user && !!event && (
    user.role === 'ADMIN' ||
    event.host.id === user.id ||
    event.staff.some((s) => s.user.id === user.id && s.role === 'HOST')
  )

  // Load event + all closes
  useEffect(() => {
    async function load() {
      try {
        const [evRes, closesRes] = await Promise.all([
          api.get(`/events/${eventId}`),
          api.get(`/events/${eventId}/daily-closes`),
        ])
        setEvent(evRes.data)
        setCloses(closesRes.data)
      } catch {
        router.push(`/event/${eventId}`)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [eventId, router])

  // Load live summary whenever date changes
  const loadSummary = useCallback(async (date: string) => {
    setSummaryLoading(true)
    setSummary(null)
    try {
      const { data } = await api.get(`/events/${eventId}/daily-closes/summary`, {
        params: { date },
      })
      setSummary(data)
    } catch {
      setSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    loadSummary(selectedDate)
    // Reset active close when date changes
    setActiveClose(null)
    setViewingClose(null)
    setFeedback(null)
  }, [selectedDate, loadSummary])

  async function handleOpenClose() {
    setOpeningClose(true)
    setFeedback(null)
    try {
      const { data } = await api.post(`/events/${eventId}/daily-closes/open`, {
        date: selectedDate,
      })
      setActiveClose(data)
      // If it was already in the list, update it; otherwise add
      setCloses((prev) => {
        const exists = prev.find((c) => c.id === data.id)
        return exists ? prev.map((c) => c.id === data.id ? data : c) : [data, ...prev]
      })
    } catch (err) {
      setFeedback({ tone: 'error', text: getErrorMessage(err, 'Erro ao abrir fechamento.') })
    } finally {
      setOpeningClose(false)
    }
  }

  async function handleClose() {
    if (!activeClose) return
    setClosing(true)
    setFeedback(null)
    try {
      const { data } = await api.patch(`/events/${eventId}/daily-closes/${activeClose.id}/close`, {
        notes: notes.trim() || undefined,
      })
      setActiveClose(data)
      setCloses((prev) => prev.map((c) => c.id === data.id ? data : c))
      setFeedback({ tone: 'ok', text: 'Dia fechado com sucesso.' })
    } catch (err) {
      setFeedback({ tone: 'error', text: getErrorMessage(err, 'Erro ao fechar dia.') })
    } finally {
      setClosing(false)
    }
  }

  async function handleReopen(closeId: string) {
    setReopening(true)
    setFeedback(null)
    try {
      const { data } = await api.patch(`/events/${eventId}/daily-closes/${closeId}/reopen`)
      setCloses((prev) => prev.map((c) => c.id === data.id ? data : c))
      if (activeClose?.id === closeId) setActiveClose(data)
      if (viewingClose?.id === closeId) setViewingClose(data)
      setFeedback({ tone: 'ok', text: 'Fechamento reaberto.' })
    } catch (err) {
      setFeedback({ tone: 'error', text: getErrorMessage(err, 'Erro ao reabrir fechamento.') })
    } finally {
      setReopening(false)
    }
  }

  if (loading) return <AppLoading />
  if (!event) return null

  // ── Detail view ──
  if (viewingClose) {
    return (
      <div className="min-h-screen bg-sx-bg">
        <AppHeader
          module="Eventos"
          title="Fechamento Diário"
          onBack={() => setViewingClose(null)}
          userName={user?.name}
          onLogout={handleLogout}
        />
        <main className="max-w-2xl mx-auto px-6 py-6 space-y-6">
          {feedback && (
            <div className={`rounded-xl border px-4 py-3 text-sm ${
              feedback.tone === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                : 'border-sx-amber/30 bg-sx-amber/10 text-sx-amber'
            }`}>
              {feedback.text}
            </div>
          )}

          <div className="rounded-2xl p-5 space-y-4"
            style={{ background: 'linear-gradient(135deg, #1C1000 0%, #0F0800 100%)', border: '1px solid rgba(245,158,11,0.12)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-sx-muted">Data</p>
                <p className="text-sm font-bold capitalize mt-0.5">{fmtDate(viewingClose.date)}</p>
              </div>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                viewingClose.status === 'CLOSED'
                  ? 'text-sx-muted bg-white/5'
                  : 'text-sx-amber bg-sx-amber/10'
              }`}>
                {viewingClose.status === 'CLOSED' ? 'Fechado' : 'Em aberto'}
              </span>
            </div>

            {/* Totals grid */}
            <div className="grid grid-cols-2 gap-3">
              <TotalCard label="Entradas" value={fmt(viewingClose.totalIn)} positive />
              <TotalCard label="Saídas" value={fmt(viewingClose.totalOut)} negative />
              <TotalCard label="Pagamentos PIX" value={fmt(viewingClose.totalPix)} />
              <TotalCard label="Pagamentos Dinheiro" value={fmt(viewingClose.totalCash)} />
            </div>

            {/* Net */}
            <div className="rounded-xl px-4 py-3 flex items-center justify-between"
              style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
              <p className="text-sm font-bold">Saldo do dia</p>
              <p className="text-lg font-black text-sx-amber">
                {fmt(String(
                  Number(viewingClose.totalIn ?? 0) - Number(viewingClose.totalOut ?? 0)
                ))}
              </p>
            </div>

            {viewingClose.closedBy && (
              <p className="text-xs text-sx-muted">
                Fechado por <span className="text-white">{viewingClose.closedBy.name}</span>
                {viewingClose.closedAt && ` em ${new Date(viewingClose.closedAt).toLocaleString('pt-BR')}`}
              </p>
            )}

            {viewingClose.notes && (
              <div className="rounded-lg px-3 py-2 text-sm text-sx-muted"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p className="text-[10px] uppercase tracking-widest mb-1">Observações</p>
                <p className="text-white/80 whitespace-pre-wrap">{viewingClose.notes}</p>
              </div>
            )}
          </div>

          {isHost && viewingClose.status === 'CLOSED' && (
            <button
              onClick={() => handleReopen(viewingClose.id)}
              disabled={reopening}
              className="w-full rounded-xl py-3 text-sm font-bold text-orange-300 disabled:opacity-50"
              style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.25)' }}
            >
              {reopening ? 'Reabrindo...' : 'Reabrir fechamento (host)'}
            </button>
          )}
        </main>
      </div>
    )
  }

  // ── Main view ──
  return (
    <div className="min-h-screen bg-sx-bg">
      <AppHeader
        module="Eventos"
        title="Fechamento Diário"
        onBack={() => router.push(`/event/${eventId}`)}
        userName={user?.name}
        onLogout={handleLogout}
        rightSlot={
          <span className="text-xs text-sx-muted">{event.name}</span>
        }
      />
      <EventTabs eventId={eventId} active="FECHAMENTO" canManage={true} />

      <main className="max-w-2xl mx-auto px-6 py-6 space-y-6">
        {feedback && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${
            feedback.tone === 'error'
              ? 'border-red-500/30 bg-red-500/10 text-red-300'
              : 'border-sx-amber/30 bg-sx-amber/10 text-sx-amber'
          }`}>
            {feedback.text}
          </div>
        )}

        {/* ── Date selector ── */}
        <div className="rounded-2xl p-5 space-y-4"
          style={{ background: 'linear-gradient(135deg, #1C1000 0%, #0F0800 100%)', border: '1px solid rgba(245,158,11,0.12)' }}>
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-sx-muted">Data</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-amber focus:outline-none"
              />
            </div>
            <button
              onClick={() => loadSummary(selectedDate)}
              disabled={summaryLoading}
              className="mt-5 rounded-xl px-4 py-2 text-xs font-bold text-sx-amber disabled:opacity-50"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
            >
              {summaryLoading ? '...' : 'Atualizar'}
            </button>
          </div>

          {/* Live totals */}
          {summary ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <TotalCard label="Entradas" value={fmt(summary.totals.totalIn)} positive />
                <TotalCard label="Saídas" value={fmt(summary.totals.totalOut)} negative />
                <TotalCard label="Pagamentos PIX" value={fmt(summary.totals.totalPix)} />
                <TotalCard label="Pagamentos Dinheiro" value={fmt(summary.totals.totalCash)} />
              </div>

              {/* Net */}
              <div className="rounded-xl px-4 py-3 flex items-center justify-between"
                style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                <p className="text-sm font-bold">Saldo do dia</p>
                <p className="text-lg font-black text-sx-amber">
                  {fmt(String(Number(summary.totals.totalIn) - Number(summary.totals.totalOut)))}
                </p>
              </div>

              {/* Item breakdown */}
              {summary.items.length > 0 && (
                <details className="group">
                  <summary className="text-xs font-bold text-sx-muted cursor-pointer select-none">
                    {summary.items.length} transações neste dia ▸
                  </summary>
                  <div className="mt-3 space-y-1 max-h-64 overflow-y-auto pr-1">
                    {summary.items.map((item) => (
                      <div key={item.id}
                        className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div>
                          <p className="font-bold">{item.comanda.player.name}</p>
                          <p className="text-sx-muted mt-0.5">{TYPE_LABEL[item.type] || item.type}</p>
                        </div>
                        <p className={`font-black ${
                          OUT_TYPES.has(item.type) ? 'text-red-300' :
                          IN_TYPES.has(item.type) ? 'text-green-300' : 'text-sx-muted'
                        }`}>
                          {OUT_TYPES.has(item.type) ? '-' : '+'}{fmt(item.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : summaryLoading ? (
            <div className="py-6 text-center text-xs text-sx-muted">Carregando resumo...</div>
          ) : (
            <div className="py-6 text-center text-xs text-sx-muted">Sem movimentações nesta data.</div>
          )}
        </div>

        {/* ── Close action ── */}
        {activeClose ? (
          <ActiveClosePanel
            close={activeClose}
            notes={notes}
            onNotesChange={setNotes}
            onClose={handleClose}
            onReopen={isHost ? () => handleReopen(activeClose.id) : undefined}
            closing={closing}
            reopening={reopening}
          />
        ) : (
          <button
            onClick={handleOpenClose}
            disabled={openingClose}
            className="w-full btn-event-primary rounded-xl py-3 text-sm font-black text-sx-bg disabled:opacity-50"
          >
            {openingClose ? 'Abrindo...' : 'Abrir fechamento para esta data'}
          </button>
        )}

        {/* ── History ── */}
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-widest text-sx-muted">Histórico de fechamentos</p>

          {closes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sx-border py-8 text-center text-xs text-sx-muted">
              Nenhum fechamento registrado.
            </div>
          ) : (
            <div className="space-y-2">
              {closes.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setViewingClose(c)}
                  className="flex items-center justify-between rounded-xl px-4 py-3 cursor-pointer transition-all"
                  style={{ background: 'linear-gradient(135deg, #1C1000 0%, #0F0800 100%)', border: '1px solid rgba(245,158,11,0.1)' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(245,158,11,0.3)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(245,158,11,0.1)' }}
                >
                  <div>
                    <p className="text-sm font-bold capitalize">
                      {new Date(c.date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                    </p>
                    {c.status === 'CLOSED' && (
                      <p className="text-xs text-sx-muted mt-0.5">
                        Entradas {fmt(c.totalIn)} · Saídas {fmt(c.totalOut)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                      c.status === 'CLOSED'
                        ? 'text-sx-muted bg-white/5'
                        : 'text-sx-amber bg-sx-amber/10'
                    }`}>
                      {c.status === 'CLOSED' ? 'Fechado' : 'Em aberto'}
                    </span>
                    <span className="text-sx-muted text-xs">›</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TotalCard({
  label,
  value,
  positive,
  negative,
}: {
  label: string
  value: string
  positive?: boolean
  negative?: boolean
}) {
  return (
    <div className="rounded-xl px-4 py-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-[10px] uppercase tracking-widest text-sx-muted mb-1">{label}</p>
      <p className={`text-base font-black ${positive ? 'text-green-300' : negative ? 'text-red-300' : 'text-white'}`}>
        {value}
      </p>
    </div>
  )
}

function ActiveClosePanel({
  close,
  notes,
  onNotesChange,
  onClose,
  onReopen,
  closing,
  reopening,
}: {
  close: DailyClose
  notes: string
  onNotesChange: (v: string) => void
  onClose: () => void
  onReopen?: () => void
  closing: boolean
  reopening: boolean
}) {
  return (
    <div className="rounded-2xl p-5 space-y-4"
      style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(245,158,11,0.15)' }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">Fechamento #{close.id.slice(-6).toUpperCase()}</p>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
          close.status === 'CLOSED'
            ? 'text-sx-muted bg-white/5'
            : 'text-sx-amber bg-sx-amber/10'
        }`}>
          {close.status === 'CLOSED' ? 'Fechado' : 'Em aberto'}
        </span>
      </div>

      {close.status === 'OPEN' && (
        <>
          <div className="space-y-1">
            <label className="text-xs text-sx-muted">Observações (opcional)</label>
            <textarea
              rows={3}
              placeholder="Ex: Mesa 2 terminou às 03h, saldo físico confere."
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              className="w-full rounded-lg border border-sx-border2 bg-sx-input px-3 py-2 text-sm focus:border-sx-amber focus:outline-none resize-none"
            />
          </div>
          <button
            onClick={onClose}
            disabled={closing}
            className="w-full btn-event-primary rounded-xl py-3 text-sm font-black text-sx-bg disabled:opacity-50"
          >
            {closing ? 'Fechando...' : 'Confirmar fechamento do dia'}
          </button>
        </>
      )}

      {close.status === 'CLOSED' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <TotalCard label="Entradas" value={close.totalIn ? Number(close.totalIn).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00'} positive />
            <TotalCard label="Saídas" value={close.totalOut ? Number(close.totalOut).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00'} negative />
          </div>
          {close.notes && (
            <p className="text-xs text-sx-muted italic">&quot;{close.notes}&quot;</p>
          )}
          {close.closedBy && (
            <p className="text-xs text-sx-muted">
              Fechado por <span className="text-white">{close.closedBy.name}</span>
            </p>
          )}
          {onReopen && (
            <button
              onClick={onReopen}
              disabled={reopening}
              className="w-full rounded-xl py-2.5 text-sm font-bold text-orange-300 disabled:opacity-50"
              style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.25)' }}
            >
              {reopening ? 'Reabrindo...' : 'Reabrir (host)'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
