'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'

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
}

const typeIsCredit = (t: string) => [
  'CASH_CASHOUT', 'TOURNAMENT_BOUNTY_RECEIVED', 'TOURNAMENT_PRIZE',
  'PAYMENT_PIX_SPOT', 'PAYMENT_PIX_TERM', 'PAYMENT_CASH', 'PAYMENT_CARD',
  'TRANSFER_IN',
].includes(t)

const typeIsDebit = (t: string) => [
  'CASH_BUYIN', 'CASH_REBUY', 'CASH_ADDON',
  'TOURNAMENT_BUYIN', 'TOURNAMENT_REBUY', 'TOURNAMENT_ADDON',
  'TRANSFER_OUT',
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
  for (const item of items) {
    const d = new Date(item.createdAt).toLocaleDateString('pt-BR')
    if (!groups[d]) groups[d] = []
    groups[d].push(item)
  }
  return groups
}

export default function ComandaDetailPage() {
  const router = useRouter()
  const { comandaId } = useParams<{ comandaId: string }>()
  const [comanda, setComanda] = useState<Comanda | null>(null)
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [paymentType, setPaymentType] = useState<string>('PAYMENT_CASH')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDesc, setPaymentDesc] = useState('')
  const [saving, setSaving] = useState(false)

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

  const input = 'w-full bg-[#155578] border border-[#1a6080] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#DFE5E0]'

  if (loading) return (
    <div className="min-h-screen bg-[#081c2e] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!comanda) return (
    <div className="min-h-screen bg-[#081c2e] text-white flex items-center justify-center text-[#DFE5E0]/60">
      Comanda não encontrada
    </div>
  )

  const balance = parseFloat(comanda.balance)
  const balanceColor = balance > 0 ? 'text-green-400' : balance < 0 ? 'text-red-400' : 'text-white'
  const grouped = groupByDate(comanda.items)
  const totalDebits = comanda.items.filter(i => typeIsDebit(i.type)).reduce((s, i) => s + parseFloat(i.amount), 0)
  const totalCredits = comanda.items.filter(i => typeIsCredit(i.type)).reduce((s, i) => s + parseFloat(i.amount), 0)

  return (
    <div className="min-h-screen bg-[#081c2e] text-white p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-[#DFE5E0]/80 hover:text-white">←</button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{comanda.player.name}</h1>
          <div className="text-xs text-[#DFE5E0]/60 mt-0.5">
            {comanda.mode === 'PREPAID' ? 'Pré-pago' : 'Pós-pago'} ·{' '}
            {comanda.status === 'OPEN' ? <span className="text-green-500">Aberta</span> : <span className="text-[#DFE5E0]/80">Fechada</span>}
          </div>
        </div>
        {comanda.status === 'OPEN' && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddPayment(true)}
              className="px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded-lg text-xs font-medium"
            >
              + Pagamento
            </button>
            <button
              onClick={handleClose}
              disabled={closing}
              className="px-3 py-1.5 bg-[#155578] hover:bg-[#1d6888] rounded-lg text-xs font-medium text-[#DFE5E0] disabled:opacity-50"
            >
              Fechar
            </button>
          </div>
        )}
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>}

      {/* Saldo */}
      <div className="bg-[#104564] rounded-2xl p-5 mb-4">
        <div className="text-xs text-[#DFE5E0]/60 uppercase tracking-wider mb-1">Saldo</div>
        <div className={`text-4xl font-black tabular-nums ${balanceColor}`}>
          {balance < 0 ? '- ' : ''}{fmtMoney(comanda.balance)}
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-[#104564]">
          <div>
            <div className="text-xs text-[#DFE5E0]/60 mb-0.5">Débitos</div>
            <div className="text-sm font-semibold text-red-400">- {fmtMoney(totalDebits)}</div>
          </div>
          <div>
            <div className="text-xs text-[#DFE5E0]/60 mb-0.5">Créditos</div>
            <div className="text-sm font-semibold text-green-400">+ {fmtMoney(totalCredits)}</div>
          </div>
        </div>
      </div>

      {/* Add payment modal */}
      {showAddPayment && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 p-4">
          <div className="bg-[#104564] rounded-2xl w-full max-w-md p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Registrar Pagamento</h3>
              <button onClick={() => setShowAddPayment(false)} className="text-[#DFE5E0]/60">✕</button>
            </div>
            <div>
              <label className="block text-xs text-[#DFE5E0]/80 mb-1">Forma de pagamento</label>
              <select className={input} value={paymentType} onChange={e => setPaymentType(e.target.value)}>
                <option value="PAYMENT_CASH">Dinheiro</option>
                <option value="PAYMENT_CARD">Cartão</option>
                <option value="PAYMENT_PIX_SPOT">PIX</option>
                <option value="PAYMENT_PIX_TERM">PIX 24h</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#DFE5E0]/80 mb-1">Valor (R$)</label>
              <input className={input} type="number" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs text-[#DFE5E0]/80 mb-1">Observação</label>
              <input className={input} value={paymentDesc} onChange={e => setPaymentDesc(e.target.value)} placeholder="Opcional" />
            </div>
            {error && <div className="text-red-400 text-sm">{error}</div>}
            <button
              onClick={handleAddPayment}
              disabled={saving || !paymentAmount}
              className="w-full py-3 bg-green-600 hover:bg-green-500 rounded-xl font-semibold text-sm disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {/* Extrato */}
      <div className="space-y-4">
        {comanda.items.length === 0 ? (
          <div className="text-center text-[#DFE5E0]/40 py-8 text-sm">Nenhuma movimentação</div>
        ) : (
          Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <div className="text-xs text-[#DFE5E0]/40 uppercase tracking-widest mb-2 px-1">{date}</div>
              <div className="space-y-1">
                {items.map(item => {
                  const isCredit = typeIsCredit(item.type)
                  const isDebit = typeIsDebit(item.type)
                  const amountColor = isCredit ? 'text-green-400' : isDebit ? 'text-red-400' : 'text-zinc-300'
                  const sign = isCredit ? '+' : isDebit ? '-' : ''
                  return (
                    <div key={item.id} className="bg-[#104564] rounded-xl px-4 py-3 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{typeLabel[item.type] ?? item.type}</div>
                        <div className="text-xs text-[#DFE5E0]/60 mt-0.5 truncate">
                          {item.tournament && <span className="text-[#DFE5E0]/80">{item.tournament.name} · </span>}
                          {item.description && <span>{item.description} · </span>}
                          {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          {item.paymentStatus && (
                            <span className={` · ${item.paymentStatus === 'PAID' ? 'text-green-500' : item.paymentStatus === 'PENDING' ? 'text-yellow-500' : 'text-[#DFE5E0]/60'}`}>
                              {paymentStatusLabel[item.paymentStatus]}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={`text-sm font-bold tabular-nums ml-4 shrink-0 ${amountColor}`}>
                        {sign} {fmtMoney(item.amount)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info rodapé */}
      <div className="mt-6 pt-4 border-t border-[#104564] text-xs text-[#DFE5E0]/40 space-y-1">
        <div>Aberta em {new Date(comanda.openedAt).toLocaleString('pt-BR')} por {comanda.openedBy.name}</div>
        {comanda.closedAt && comanda.closedBy && (
          <div>Fechada em {new Date(comanda.closedAt).toLocaleString('pt-BR')} por {comanda.closedBy.name}</div>
        )}
        {comanda.note && <div>Obs: {comanda.note}</div>}
      </div>
    </div>
  )
}
