'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'
import AppHeader from '@/components/AppHeader'
import AppLoading from '@/components/AppLoading'
import { useAuthStore } from '@/store/useStore'

interface ComandaItem {
  id: string
  type: string
  amount: string
  description: string | null
  paymentStatus: string | null
  createdAt: string
  tournament: { id: string; name: string } | null
  session: { id: string } | null
}

interface Comanda {
  id: string
  status: 'OPEN' | 'CLOSED'
  mode: 'PREPAID' | 'POSTPAID'
  balance: string
  homeGameId: string
  openedAt: string
  closedAt: string | null
  note: string | null
  player: { id: string; name: string; cpf: string }
  openedBy: { id: string; name: string }
  closedBy: { id: string; name: string } | null
  items: ComandaItem[]
}

const typeLabel: Record<string, string> = {
  CASH_BUYIN: 'Buy-in cash',
  CASH_REBUY: 'Rebuy cash',
  CASH_ADDON: 'Add-on cash',
  CASH_CASHOUT: 'Cashout',
  TOURNAMENT_BUYIN: 'Buy-in torneio',
  TOURNAMENT_REBUY: 'Rebuy torneio',
  TOURNAMENT_ADDON: 'Add-on torneio',
  TOURNAMENT_BOUNTY_RECEIVED: 'Bounty recebido',
  TOURNAMENT_PRIZE: 'Prêmio',
  PAYMENT_PIX_SPOT: 'Pagamento PIX',
  PAYMENT_PIX_TERM: 'PIX 24h',
  PAYMENT_CASH: 'Pagamento dinheiro',
  PAYMENT_CARD: 'Pagamento cartão',
  TRANSFER_IN: 'Transferência recebida',
  TRANSFER_OUT: 'Transferência enviada',
  CARRY_IN: 'Saldo transportado (crédito)',
  CARRY_OUT: 'Saldo transportado (débito)',
}

const typeIsCredit = (t: string) => [
  'CASH_CASHOUT', 'TOURNAMENT_BOUNTY_RECEIVED', 'TOURNAMENT_PRIZE',
  'PAYMENT_PIX_SPOT', 'PAYMENT_PIX_TERM', 'PAYMENT_CASH', 'PAYMENT_CARD',
  'TRANSFER_IN', 'CARRY_IN',
].includes(t)

const typeIsDebit = (t: string) => [
  'CASH_BUYIN', 'CASH_REBUY', 'CASH_ADDON',
  'TOURNAMENT_BUYIN', 'TOURNAMENT_REBUY', 'TOURNAMENT_ADDON',
  'TRANSFER_OUT', 'CARRY_OUT',
].includes(t)

const paymentStatusLabel: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  EXPIRED: 'Expirado',
  CANCELED: 'Cancelado',
}

function fmtMoney(n: string | number) {
  return `R$ ${Math.abs(parseFloat(String(n))).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

function groupByDate(items: ComandaItem[]) {
  const groups: Record<string, ComandaItem[]> = {}
  for (const item of [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())) {
    const d = new Date(item.createdAt).toLocaleDateString('pt-BR')
    if (!groups[d]) groups[d] = []
    groups[d].push(item)
  }
  return groups
}

export default function ComandaDetailPage() {
  const router = useRouter()
  const { comandaId } = useParams<{ comandaId: string }>()
  const { user, logout } = useAuthStore()
  const [comanda, setComanda] = useState<Comanda | null>(null)
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [paymentType, setPaymentType] = useState<string>('PAYMENT_CASH')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDesc, setPaymentDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [showSendPix, setShowSendPix] = useState(false)
  const [pixAmount, setPixAmount] = useState('')
  const [sendingPix, setSendingPix] = useState(false)

  const load = () => {
    api.get(`/comanda/${comandaId}`).then(r => setComanda(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [comandaId])

  const handleClose = async () => {
    if (!confirm('Fechar esta comanda?')) return
    setClosing(true)
    try {
      await api.post(`/comanda/${comandaId}/close`)
      load()
    } catch (e: any) {
      setError(e.toString())
    } finally {
      setClosing(false)
    }
  }

  const handleAddPayment = async () => {
    if (!paymentAmount) return
    setSaving(true)
    setError(null)
    try {
      await api.post(`/comanda/${comandaId}/items`, {
        type: paymentType,
        amount: parseFloat(paymentAmount),
        description: paymentDesc || undefined,
      })
      setShowAddPayment(false)
      setPaymentAmount('')
      setPaymentDesc('')
      load()
    } catch (e: any) {
      setError(e.toString())
    } finally {
      setSaving(false)
    }
  }

  const handleSendPix = async () => {
    if (!pixAmount) return
    setSendingPix(true)
    setError(null)
    try {
      await api.post(`/comanda/${comandaId}/items`, {
        type: 'TRANSFER_OUT',
        amount: parseFloat(pixAmount),
        description: 'PIX enviado ao jogador',
      })
      setShowSendPix(false)
      setPixAmount('')
      load()
    } catch (e: any) {
      setError(e.toString())
    } finally {
      setSendingPix(false)
    }
  }

  const input = 'w-full bg-sx-input border border-sx-border2 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sx-cyan'

  if (loading) return <AppLoading />

  if (!comanda) return (
    <div className="min-h-screen bg-sx-bg text-white flex items-center justify-center text-white/40">
      Comanda não encontrada
    </div>
  )

  const balance = parseFloat(comanda.balance)
  const balanceColor = balance > 0 ? 'text-green-400' : balance < 0 ? 'text-red-400' : 'text-white'
  const grouped = groupByDate(comanda.items)
  const totalDebits = comanda.items.filter(i => typeIsDebit(i.type)).reduce((s, i) => s + parseFloat(i.amount), 0)
  const totalCredits = comanda.items.filter(i => typeIsCredit(i.type)).reduce((s, i) => s + parseFloat(i.amount), 0)

  return (
    <div className="min-h-screen bg-sx-bg text-white">
      <AppHeader
        onBack={() => router.back()}
        userName={user?.name}
        onLogout={() => { logout(); router.push('/') }}
      />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-4">

        {/* Título */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{comanda.player.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-white/40">
                {comanda.mode === 'PREPAID' ? 'Pré-pago' : 'Pós-pago'}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                comanda.status === 'OPEN'
                  ? 'bg-sx-cyan-deep/40 text-sx-cyan border border-sx-cyan-dim'
                  : 'bg-sx-input text-sx-muted border border-sx-border2'
              }`}>
                {comanda.status === 'OPEN' ? 'Aberta' : 'Fechada'}
              </span>
            </div>
          </div>
          {comanda.status === 'OPEN' && (
            <div className="flex gap-2 flex-wrap justify-end">
              {balance > 0 && (
                <button
                  onClick={() => { setPixAmount(balance.toFixed(2)); setShowSendPix(true) }}
                  className="px-3 py-1.5 bg-sx-cyan/20 hover:bg-sx-cyan/30 border border-sx-cyan/40 rounded-lg text-xs font-medium text-sx-cyan"
                >
                  Enviar PIX ↗
                </button>
              )}
              <button
                onClick={() => {
                if (balance < 0) setPaymentAmount(Math.abs(balance).toFixed(2))
                setShowAddPayment(true)
              }}
                className="px-3 py-1.5 bg-sx-cyan-dim hover:bg-sx-cyan rounded-lg text-xs font-medium"
              >
                + Pagamento
              </button>
              <button
                onClick={handleClose}
                disabled={closing}
                className="px-3 py-1.5 bg-sx-input hover:bg-sx-card2 border border-sx-border2 rounded-lg text-xs font-medium text-sx-muted hover:text-white disabled:opacity-50"
              >
                Fechar comanda
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>
        )}

        {/* Card de saldo */}
        <div className="bg-sx-card border border-sx-border rounded-xl p-5">
          <div className="text-xs text-white/40 uppercase tracking-wider mb-1">Saldo atual</div>
          <div className={`text-4xl font-black tabular-nums ${balanceColor}`}>
            {balance < 0 ? '- ' : ''}{fmtMoney(comanda.balance)}
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-sx-border">
            <div>
              <div className="text-xs text-white/40 mb-0.5">Débitos</div>
              <div className="text-sm font-semibold text-red-400">− {fmtMoney(totalDebits)}</div>
            </div>
            <div>
              <div className="text-xs text-white/40 mb-0.5">Créditos</div>
              <div className="text-sm font-semibold text-green-400">+ {fmtMoney(totalCredits)}</div>
            </div>
          </div>
        </div>

        {/* Extrato */}
        <div>
          <h3 className="text-xs text-white/40 uppercase tracking-widest font-medium mb-3">Movimentações</h3>
          {comanda.items.length === 0 ? (
            <div className="text-center text-white/30 py-10 text-sm bg-sx-card border border-sx-border rounded-xl">
              Nenhuma movimentação
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([date, items]) => (
                <div key={date}>
                  <div className="text-xs text-white/30 uppercase tracking-widest mb-2 px-1">{date}</div>
                  <div className="rounded-xl overflow-hidden border border-white/5">
                    {items.map((item, i) => {
                      const isCredit = typeIsCredit(item.type)
                      const isDebit = typeIsDebit(item.type)
                      const amountColor = isCredit ? 'text-sx-cyan' : isDebit ? 'text-red-400' : 'text-zinc-300'
                      const sign = isCredit ? '+' : isDebit ? '−' : ''
                      const rowBg = i % 2 === 0 ? 'bg-sx-card' : 'bg-white/[0.03]'
                      return (
                        <div key={item.id} className={`${rowBg} px-4 py-3 flex items-center justify-between gap-3`}>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{typeLabel[item.type] ?? item.type}</div>
                            <div className="text-xs text-white/40 mt-0.5 truncate">
                              {item.tournament && (
                                <span className="text-sx-muted">{item.tournament.name} · </span>
                              )}
                              {item.description === 'Saldo transportado da comanda anterior' ? (
                                <button
                                  onClick={() => router.push(`/comanda?homeGameId=${comanda.homeGameId}&playerId=${comanda.player.id}&status=CLOSED`)}
                                  className="text-sx-cyan hover:underline"
                                >
                                  Saldo transportado · ver histórico ↗
                                </button>
                              ) : item.description ? (
                                <span>{item.description} · </span>
                              ) : null}
                              {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              {item.paymentStatus && (
                                <span className={` · ${
                                  item.paymentStatus === 'PAID' ? 'text-sx-cyan'
                                  : item.paymentStatus === 'PENDING' ? 'text-yellow-500'
                                  : 'text-white/40'
                                }`}>
                                  {paymentStatusLabel[item.paymentStatus]}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {item.paymentStatus === 'PENDING' && (
                              <button
                                onClick={async () => {
                                  await api.patch(`/comanda/items/${item.id}/settle`, { paymentStatus: 'PAID' })
                                  load()
                                }}
                                className="px-2 py-1 text-xs font-semibold rounded-lg"
                                style={{ background: 'rgba(0,200,224,0.15)', border: '1px solid rgba(0,200,224,0.3)', color: '#00C8E0' }}
                              >
                                ✓ Confirmar
                              </button>
                            )}
                            <div className={`text-sm font-bold tabular-nums ${amountColor}`}>
                              {sign} {fmtMoney(item.amount)}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="pt-4 border-t border-sx-border text-xs text-white/30 space-y-1">
          <div>Aberta em {new Date(comanda.openedAt).toLocaleString('pt-BR')} por {comanda.openedBy.name}</div>
          {comanda.closedAt && comanda.closedBy && (
            <div>Fechada em {new Date(comanda.closedAt).toLocaleString('pt-BR')} por {comanda.closedBy.name}</div>
          )}
          {comanda.note && <div>Obs: {comanda.note}</div>}
        </div>

      </main>

      {/* Modal enviar PIX */}
      {showSendPix && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4" style={{ backdropFilter: 'blur(4px)' }}>
          <div className="bg-sx-card border border-sx-border rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Enviar PIX</h3>
              <button onClick={() => setShowSendPix(false)} className="text-white/40 hover:text-white">✕</button>
            </div>
            <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(0,200,224,0.06)', border: '1px solid rgba(0,200,224,0.15)' }}>
              <div className="text-xs text-sx-muted mb-0.5">Destinatário</div>
              <div className="font-semibold text-white">{comanda.player.name}</div>
            </div>
            <div>
              <label className="block text-xs text-sx-muted mb-1">Valor (R$)</label>
              <input
                className={input}
                type="number"
                step="0.01"
                value={pixAmount}
                onChange={e => setPixAmount(e.target.value)}
                placeholder="0.00"
              />
              <div className="text-xs text-white/30 mt-1">
                Saldo atual: <span className="text-sx-cyan">{fmtMoney(balance)}</span>
              </div>
            </div>
            {error && <div className="text-red-400 text-sm">{error}</div>}
            <button
              onClick={handleSendPix}
              disabled={sendingPix || !pixAmount}
              className="w-full py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
              style={{ background: '#00C8E0', color: '#050D15' }}
            >
              {sendingPix ? 'Registrando...' : 'Confirmar envio'}
            </button>
          </div>
        </div>
      )}

      {/* Modal pagamento */}
      {showAddPayment && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4" style={{ backdropFilter: 'blur(4px)' }}>
          <div className="bg-sx-card border border-sx-border rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Registrar Pagamento</h3>
              <button onClick={() => setShowAddPayment(false)} className="text-white/40 hover:text-white">✕</button>
            </div>
            <div>
              <label className="block text-xs text-sx-muted mb-1">Forma de pagamento</label>
              <select className={input} value={paymentType} onChange={e => setPaymentType(e.target.value)}>
                <option value="PAYMENT_CASH">Dinheiro</option>
                <option value="PAYMENT_CARD">Cartão</option>
                <option value="PAYMENT_PIX_SPOT">PIX</option>
                <option value="PAYMENT_PIX_TERM">PIX 24h</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-sx-muted mb-1">Valor (R$)</label>
              <input className={input} type="number" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs text-sx-muted mb-1">Observação</label>
              <input className={input} value={paymentDesc} onChange={e => setPaymentDesc(e.target.value)} placeholder="Opcional" />
            </div>
            {error && <div className="text-red-400 text-sm">{error}</div>}
            <button
              onClick={handleAddPayment}
              disabled={saving || !paymentAmount}
              className="w-full py-3 bg-sx-cyan hover:bg-sx-cyan rounded-xl font-semibold text-sm disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
